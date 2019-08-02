'use strict';

const path = require('path');
const webpack = require('webpack');
const merge = require('webpack-merge');
const LodashModuleReplacementPlugin = require('lodash-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const PackageExtendResolverPlugin = require('package-extend-resolver-plugin');
const { getPaths, getDotenv, resolveToExistingOrNull } = require('../utils');

const modeConfig = mode => require(`./webpack.common.${mode}.js`)(mode);

module.exports = (mode = 'production') => {
	const isEnvProduction = mode === 'production';
	const {
		PACKAGE_ROOT,
		BASE_PACKAGE_ROOT,
		OUTPUT_PATH,
		assetResolutionOrder
	} = getPaths();
	const ENV = getDotenv(mode);

	// babel-preset-react-app requires these
	process.env.NODE_ENV = process.env.BABEL_ENV = mode;

	return merge.smart(
		{
			mode,
			entry: ['index'],
			output: {
				path: OUTPUT_PATH,
				publicPath: '/',
				filename: 'static/js/[name].[hash:8].js',
				chunkFilename: 'static/js/[name].[hash:8].chunk.js'
			},
			resolve: {
				extensions: ['.js', '.json', '.jsx']
			},
			plugins: [
				new webpack.ProgressPlugin(),
				new webpack.DefinePlugin({ dotenv: JSON.stringify(ENV) }),
				new LodashModuleReplacementPlugin(),
				new webpack.IgnorePlugin({
					resourceRegExp: /^\.\/locale$/,
					contextRegExp: /moment$/
				}),
				new PackageExtendResolverPlugin({
					lookIn: ['src'], // relative to the package root (node_modules will be looked in automatically)
					assumeExtensions: ['.jsx']
				})
				// new BundleAnalyzerPlugin()
			].filter(Boolean),
			module: {
				rules: [
					{
						oneOf: [
							// "url" loader works just like "file" loader but it also embeds
							// assets smaller than specified size as data URLs to avoid requests.
							{
								test: /\.(bmp|gif|jpe?g|png|ttf|svg|woff)$/,
								loader: 'url-loader',
								options: {
									limit: 10000,
									name: 'static/media/[name].[hash:8].[ext]'
								}
							},
							{
								test: /\.(js|jsx)$/,
								loader: require.resolve('babel-loader'),
								options: {
									presets: ['react-app'],
									customize: require.resolve(
										'babel-preset-react-app/webpack-overrides'
									),
									// This is a feature of `babel-loader` for webpack (not Babel itself).
									// It enables caching results in ./node_modules/.cache/babel-loader/
									// directory for faster rebuilds.
									cacheDirectory: true,
									cacheCompression: isEnvProduction,
									compact: isEnvProduction,
									plugins: [
										[
											'babel-plugin-transform-builtin-extend',
											{
												globals: ['Error', 'Array']
											}
										]
									]
								}
							},
							{
								test: /\.scss$/,
								use: [
									isEnvProduction
										? MiniCssExtractPlugin.loader
										: 'style-loader',
									{
										loader: 'css-loader',
										options: {
											importLoaders: 1
										}
									},
									{
										loader: 'postcss-loader',
										options: {
											// Necessary for external CSS imports to work
											// https://github.com/facebookincubator/create-react-app/issues/2677
											ident: 'postcss',
											plugins: () => [
												require('postcss-flexbugs-fixes'),
												require('autoprefixer')({
													browsers: [
														'>1%',
														'last 4 versions',
														'Firefox ESR',
														'not ie < 9' // React doesn't support IE8 anyway
													],
													flexbox: 'no-2009'
												}),
												require('cssnano')({
													presets: 'default'
												})
											]
										}
									},
									{
										loader: 'sass-loader',
										options: {
											importer: (url, prev, done) => {
												url = url.replace(/^~/, '');

												if (!url.startsWith('.')) {
													url = resolveToExistingOrNull(
														assetResolutionOrder,
														path.join('src', url)
													);
												}

												return { file: url };
											}
										}
									}
								]
							}
						]
					}
				]
			},
			// Some libraries import Node modules but don't use them in the browser.
			// Tell Webpack to provide empty mocks for them so importing them works.
			node: {
				dgram: 'empty',
				fs: 'empty',
				net: 'empty',
				tls: 'empty',
				child_process: 'empty'
			}
		},
		modeConfig(mode)
	);
};

// console.log(require('util').inspect(module.exports('development'), false, null, true))
