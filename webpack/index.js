const merge = require('webpack-merge');

const customMerge = merge({
    // make sure that our plugin versions override original ones
    customizeArray (arr1, arr2, key) {
        switch (key) {
            case 'entry':
                return arr2;


            case 'plugins':
                const toObj = arr => {
                    const obj = {}
                    arr.forEach(plugin => {
                        obj[plugin.constructor.name] = plugin
                    })
                    return obj
                }
                return Object.values(Object.assign(toObj(arr1), toObj(arr2)))
        }
        // Fall back to default merging
        return undefined
    }
});

const { getPaths, requireOrNull } = require('../utils');

const getCommonWebpackConfig = mode => {
    return require('./webpack.common')(mode);
}

const getBasePackageWebpackConfig = mode => {
    const { assetResolutionOrder } = getPaths();
    return customMerge(
        getCommonWebpackConfig(mode),
        requireWebpackConfig(assetResolutionOrder, mode)
    )
}

const requireWebpackConfig = (basePaths, mode = 'production') => {
    const webpackConfig = requireOrNull(basePaths, 'webpack.config.js');
    return webpackConfig
        ? typeof webpackConfig === 'function'
            ? webpackConfig(mode)
            : webpackConfig
        : {};
}

const buildForMode = (mode = 'production') => {
    mode = mode.replace(/^\-+/, '');
    return buildForConfig(getBasePackageWebpackConfig(mode));
}

const buildForConfig = config => {
    const mode = config.mode || 'production';

    try {
        require.resolve(`./build.${mode}`);
    } catch(ex) {
        console.log(`There's no builder for the "${mode}" mode.`);
        process.exit(1);
    }

    require(`./build.${mode}`)(config);
}

module.exports = {
    getCommonWebpackConfig,
    getBasePackageWebpackConfig,
    buildForMode,
    buildForConfig,
}
