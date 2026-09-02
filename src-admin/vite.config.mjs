import react from '@vitejs/plugin-react';
import commonjs from 'vite-plugin-commonjs';
import { federation } from '@module-federation/vite';
import { moduleFederationShared } from '@iobroker/gui-components/modulefederation.admin.config';
import packageJson from '../package.json' with { type: 'json' };

export default {
    root: './src-admin',
    plugins: [
        federation({
            manifest: true,
            name: 'AiAnalyticsConfig',
            filename: 'customComponents.js',
            exposes: { './Components': './src/Components.js' },
            remotes: {},
            shared: moduleFederationShared(packageJson),
            dts: false,
        }),
        react(),
        commonjs(),
    ],
    base: './',
    build: {
        target: 'chrome89',
        outDir: '../admin/custom',
        emptyOutDir: true,
        rollupOptions: {
            output: {
                entryFileNames: 'assets/[name]-[hash].js',
                chunkFileNames: 'assets/chunk-[hash].js',
                assetFileNames: 'assets/asset-[hash][extname]',
            },
        },
    },
};
