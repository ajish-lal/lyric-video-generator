import path from 'node:path';
import { fileURLToPath } from 'node:url';
import HtmlWebpackPlugin from 'html-webpack-plugin';

const root = path.dirname(fileURLToPath(import.meta.url));

export default {
  mode: 'development',
  entry: './src/ui/index.js',
  output: {
    path: path.resolve(root, 'dist-ui'),
    filename: 'bundle.js',
    clean: true,
  },
  devtool: 'inline-source-map',
  module: {
    rules: [
      {
        test: /\.(js|jsx|ts|tsx)$/,
        exclude: /node_modules/,
        loader: 'esbuild-loader',
        // The `tsx` loader parses TypeScript and JSX (and plain JS/JSX); some
        // `.js` files in this UI contain JSX, so it must run through it too.
        options: { loader: 'tsx', target: 'es2020' },
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
      },
    ],
  },
  resolve: {
    extensions: ['.js', '.jsx', '.ts', '.tsx'],
    extensionAlias: { '.js': ['.js', '.ts'] },
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './src/ui/index.html',
      filename: 'index.html',
    }),
  ],
  devServer: {
    static: './dist-ui',
    port: 3012,
    open: false,
    host: '0.0.0.0',
  },
};
