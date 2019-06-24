const buildForMode = (mode = '--production', bundler = 'webpack') => {
    require(`./${bundler}`).buildForMode(mode.replace(/^\-+/, ''));
}

const buildForConfig = (config, bundler = 'webpack') => {
    require(`./${bundler}`).buildForConfig(config);
}

module.exports = {
    buildForMode,
    buildForConfig,
}
