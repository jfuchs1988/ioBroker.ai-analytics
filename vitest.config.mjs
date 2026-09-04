import react from '@vitejs/plugin-react';

export default {
    plugins: [react()],
    test: {
        environment: 'jsdom',
        include: ['test/admin/**/*.test.jsx'],
        setupFiles: ['./test/admin/setup.js'],
    },
};
