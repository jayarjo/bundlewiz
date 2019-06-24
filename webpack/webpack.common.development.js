'use strict';

const fs = require('fs');
const path = require('path');
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const { getPaths } = require('../utils');

module.exports = mode => {
    const { PUBLIC_PATH } = getPaths();

    return {
        devtool: 'source-map',
        entry: [
            require.resolve('webpack-dev-server/client') + '?/',
            require.resolve('webpack/hot/dev-server'),
            // require.resolve('react-dev-utils/webpackHotDevClient'),
        ],
        output: {
            // Add /* filename */ comments to generated require()s in the output.
            pathinfo: true,
            // This does not produce a real file. It's just the virtual path that is
            // served by WebpackDevServer in development. This is the JS bundle
            // containing code from all our entry points, and the Webpack runtime.
            filename: 'static/js/bundle.js',
            // Point sourcemap entries to original disk location (format as URL on Windows)
            devtoolModuleFilenameTemplate: info => path.resolve(info.absoluteResourcePath).replace(/\\/g, '/'),
        },
        plugins: [
            // Generates an `index.html` file with the <script> injected.
            new HtmlWebpackPlugin({
                inject: true,
                template: fs.existsSync(PUBLIC_PATH)
                    ? path.resolve(PUBLIC_PATH, 'index.html')
                    : require.resolve('html-webpack-plugin/default_index.ejs'),
            }),
            // Add module names to factory functions so they appear in browser profiler.
            new webpack.NamedModulesPlugin(),
            // This is necessary to emit hot updates (currently CSS only):
            new webpack.HotModuleReplacementPlugin(),
        ].filter(Boolean),
        // Turn off performance hints during development because we don't do any
        // splitting or minification in interest of speed. These warnings become
        // cumbersome.
        performance: {
            hints: false,
        },

    }
};
