# Three.js (vendored, tree-shaken)

`three.min.js` is Three.js r186 (MIT licence, https://threejs.org) bundled with esbuild from `entry.js`,
so the page only downloads what `assets/js/scene.js` uses. It is loaded lazily (dynamic `import`) after the
page is interactive, and only when WebGL works and the visitor has not asked for reduced motion.

Rebuild after changing the exports in `entry.js`:

    npm install three@0.186.1 esbuild
    npx esbuild entry.js --bundle --minify --format=esm --outfile=three.min.js
