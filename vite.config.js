import path from 'node:path';

export default {
  resolve: {
    alias: {
      three: path.resolve(process.cwd(), 'vendor/three.module.js')
    }
  }
};