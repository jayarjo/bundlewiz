const dotenv = require('dotenv')
const fs = require('fs-extra')
const GitRevision = require('git-revision-webpack-plugin')
const glob = require('glob')
const Module = require('module')
const path = require('path')

const invariant = (expr, message) => {
  if (typeof expr === 'function') {
    expr = expr()
  }
  if (!expr) {
    throw new Error(message)
  }
}

const getWorkspaceDirs = dir => {
  const PACKAGE = requireOrNull(dir, 'package.json')
  if (!PACKAGE || !PACKAGE.workspaces) {
    return null
  } else {
    return PACKAGE.workspaces.reduce(
      (workspaceDirs, pattern) => [
        ...workspaceDirs,
        ...(!glob.hasMagic(pattern)
          ? [path.resolve(dir, pattern)]
          : glob.sync(pattern, {
            cwd: dir,
            follow: false,
            nodir: false,
            absolute: true
          }))
      ],
      []
    )
  }
}

const findMonorepoRootFor = (pkgDir, currentDir = null) => {
  if (!currentDir) {
    currentDir = pkgDir
  }

  const checkDir = path.resolve(currentDir, '../')
  if (!fs.existsSync(checkDir) || checkDir === '/') {
    // root dir resolves to itself (huh)
    return null
  }

  const workspaceDirs = getWorkspaceDirs(checkDir)
  if (!workspaceDirs) {
    return findMonorepoRootFor(pkgDir, checkDir)
  } else if (workspaceDirs.indexOf(pkgDir) !== -1) {
    return checkDir
  } else {
    return null // one of parent directories is monorepo, but it doesn't recognize the package
  }
}

const getPaths = (PACKAGE_ROOT = path.resolve(process.cwd())) => {
  if (!PACKAGE_ROOT && getPaths.PATHS) {
    return getPaths.PATHS
  }

  const PACKAGE = requireOrNull(PACKAGE_ROOT, 'package.json')

  invariant(PACKAGE, `package.json not found in ${PACKAGE_ROOT}.`)

  const MONOREPO_ROOT = findMonorepoRootFor(PACKAGE_ROOT)
  let BASE_PACKAGE_ROOT = null

  if (PACKAGE && PACKAGE.extends) {
    const pkgName = PACKAGE.extends
    const pkgNameWithoutScope = /^@\w+\//.test(pkgName)
      ? pkgName.split('/')[1]
      : pkgName

    if (MONOREPO_ROOT) {
      const workspaceDirs = getWorkspaceDirs(MONOREPO_ROOT)
      BASE_PACKAGE_ROOT = workspaceDirs.find(
        dir => dir.endsWith(pkgName) || dir.endsWith(pkgNameWithoutScope)
      )
      if (!BASE_PACKAGE_ROOT) {
        BASE_PACKAGE_ROOT = resolveToExistingOrNull(
          PACKAGE_ROOT,
          `node_modules/${pkgName}`
        )
      }
    }
  }

  const assetResolutionOrder = [
    PACKAGE_ROOT,
    BASE_PACKAGE_ROOT,
    MONOREPO_ROOT
  ].filter(Boolean)

  return (getPaths.PATHS = {
    PACKAGE_ROOT,
    MONOREPO_ROOT,
    BASE_PACKAGE_ROOT,
    PUBLIC_PATH: resolveToExistingOrNull(assetResolutionOrder, 'public'),
    OUTPUT_PATH: path.resolve(PACKAGE_ROOT, 'dist'),
    assetResolutionOrder
  })
}

const getPathOffset = (context, rootDirs = getPaths().assetResolutionOrder) => {
  for (const rootDir of rootDirs) {
    if (context === rootDir) {
      return ''
    } else if (context.startsWith(rootDir)) {
      return context.replace(rootDir, '').replace(/^[\/\\]+/, '')
    }
  }
  return null
}

const getLookUpDirChain = (
  relativeRoots,
  rootDirs = getPaths().assetResolutionOrder
) => {
  const dirChain = []
  relativeRoots.forEach(relativeDir => {
    if (path.isAbsolute(relativeDir)) {
      dirChain.push(relativeDir)
    } else {
      rootDirs.forEach(rootDir =>
        dirChain.push(path.resolve(rootDir, relativeDir))
      )
    }
  })
  return dirChain
}

const getEnv = mode => {
  const paths = getPaths()
  const gitRev = new GitRevision()
  const PACKAGE = requireOrNull(paths.PACKAGE_ROOT, 'package.json')
  return {
    ...getDotenv(mode),
    NODE_ENV: mode,
    APP_NAME: PACKAGE.name,
    APP_VERSION: PACKAGE.version,
    BRANCH: gitRev.branch(),
    COMMITHASH: gitRev.commithash()
  }
}

const getDotenv = mode => {
  const { assetResolutionOrder } = getPaths()
  return requireDotenv(assetResolutionOrder, mode)
}

const getPackageJson = () => {
  const { assetResolutionOrder } = getPaths()
  return requireOrNull(assetResolutionOrder, 'package.json') || {}
}

const prepareOutputDir = () => {
  const { PUBLIC_PATH, OUTPUT_PATH } = getPaths()
  // Remove all content but keep the directory so that
  // if you're in it, you don't end up in Trash
  fs.emptyDirSync(OUTPUT_PATH)
  if (fs.existsSync(PUBLIC_PATH)) {
    fs.copySync(PUBLIC_PATH, OUTPUT_PATH, { dereference: true })
  }
}

const resolveToExistingOrNull = (
  basePaths,
  relativePath,
  returnContext = false
) => {
  if (!relativePath) {
    return null
  }

  if (!Array.isArray(basePaths)) {
    basePaths = [basePaths]
  }

  for (const basePath of basePaths) {
    const absPath = path.resolve(basePath, relativePath)
    if (fs.existsSync(absPath)) {
      return returnContext ? basePath : absPath
    }
  }
  return null
}

const resolveToModuleOrNull = (
  paths,
  assumeExtensions,
  relativePath,
  excludes = []
) => {
  const isExcluded = absPath => {
    if (Array.isArray(excludes) && excludes.length) {
      for (const exclude of excludes) {
        if (
          (exclude instanceof RegExp && exclude.test(absPath)) ||
          exclude === absPath
        ) {
          return true
        }
      }
    }
    return false
  }

  const overrideAssumedExtensions = () => {
    const extensions = Object.assign({}, Module._extensions)
    if (Array.isArray(assumeExtensions) && assumeExtensions.length) {
      assumeExtensions.forEach(ext => {
        extensions[ext] = Module._extensions['.js']
      })
    }
    return extensions
  }

  if (!relativePath) {
    return null
  }

  if (!Array.isArray(paths)) {
    paths = [paths]
  }

  // save original resolution sequence and override it (this is marked as deprecated, but is locked
  // and won't be ever removed: https://nodejs.org/api/modules.html#modules_require_extensions)
  // UPDATE: turns out require.extensions is simply a reference, let's go full dirty and re-assign
  // Module._extensions directly!
  const originalExtensions = Module._extensions
  Module._extensions = overrideAssumedExtensions()

  try {
    // require.resolve uses the same module resolution logic as require, but returns only
    // the resolved absolute path (IMPORTANT: throws if nothing is found!)
    // the exact resolution logic of require: https://nodejs.org/api/modules.html#modules_all_together
    const absPath = require.resolve(relativePath, { paths })
    if (!isExcluded(absPath)) {
      return absPath
    }
  } catch (ex) {
    // TODO: log something meaningful maybe
  } finally {
    // restore original extension resolution sequence
    Module._extensions = originalExtensions
  }
  return null
}

const resolveToExistingDotenv = (basePaths, mode = 'production') => {
  const dotenvFiles = [
    `.env.${mode}.local`,
    `.env.${mode}`,
    // Don't include `.env.local` for `test` environment
    // since normally you expect tests to produce the same
    // results for everyone
    mode !== 'test' && `.env.local`,
    '.env'
  ].filter(Boolean)

  for (const basePath of basePaths) {
    for (const dotenvFile of dotenvFiles) {
      const absPath = path.resolve(basePath, dotenvFile)
      if (fs.existsSync(absPath)) {
        return absPath
      }
    }
  }
  return null
}

const requireOrNull = (basePaths, relativePath) => {
  const absPath = resolveToExistingOrNull(basePaths, relativePath)
  return absPath ? require(absPath) : null
}

const requireDotenv = (basePaths, mode = 'production') => {
  const dotenvPath = resolveToExistingDotenv(basePaths, mode)
  return dotenvPath ? dotenv.parse(fs.readFileSync(dotenvPath).toString()) : {}
}

const replaceVars = (
  inPath,
  outPath = null,
  vars = false,
  pattern = /%([^%]+)%/g
) => {
  if (!outPath) {
    outPath = inPath
  }

  if (!vars) {
    vars = getDotenv()
  }

  if (!fs.existsSync(inPath)) {
    console.log(
      `Cannot replace ${pattern.toString()} placeholders - ${inPath} doesn't exist!`
    )
    process.exit(1)
  }

  const contents = fs.readFileSync(inPath).toString()
  const replaced = contents.replace(pattern, ($0, $1) =>
    vars.hasOwnProperty($1) ? vars[$1] : $0
  )
  fs.writeFileSync(outPath, replaced)
}

module.exports = {
  getEnv,
  getPaths,
  getPathOffset,
  getLookUpDirChain,
  getDotenv,
  getPackageJson,
  prepareOutputDir,
  replaceVars,
  requireOrNull,
  requireDotenv,
  resolveToExistingOrNull,
  resolveToModuleOrNull
}
