const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

const browser = process.env.BROWSER;
const BUILD_DIR_NAME = 'dist';
const SRC_DIR_NAME = 'src';

module.exports = {
  entry: {
    background: path.join(__dirname, `../${SRC_DIR_NAME}/background/${browser}/background.ts`),
    app: path.join(__dirname, '../src/lib/app.ts'),
    options: path.join(__dirname, '../src/options.ts'),
    injectLoginRedirect: path.resolve(__dirname, "../src/lib/injectLoginRedirect.ts")
  },
  output: {
    path: path.join(__dirname, `../${BUILD_DIR_NAME}`),
    filename: '[name].js',
  },
  optimization: {
    splitChunks: {
      name: 'vendor',
      chunks: 'initial',
    },
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
      },
    ],
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js'],
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        { from: './images', to: `../${BUILD_DIR_NAME}/images`, context: 'public' },
        { from: './popup.html', to: `../${BUILD_DIR_NAME}/popup.html`, context: 'public' },
        { from: `${browser}_manifest.json`, to: `../${BUILD_DIR_NAME}/manifest.json`, context: 'public' },
        { from: './options.html', to: `../${BUILD_DIR_NAME}/options.html`, context: 'public' },
      ],
    }),
  ],
};
