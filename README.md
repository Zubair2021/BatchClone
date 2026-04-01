# Gibson Assembly Tool

This Vite app is configured for deployment to GitHub Pages through GitHub Actions.

## Local development

```bash
npm install
npm run dev
```

## Deploy to GitHub Pages

1. Create a GitHub repository and push this project to its `main` branch.
2. In GitHub, open `Settings` -> `Pages`.
3. Set `Source` to `GitHub Actions`.
4. Push to `main`. The workflow in `.github/workflows/deploy-pages.yml` will build and deploy the site.

## URL behavior

- If the repository name is `USERNAME.github.io`, the site will be served from `/`.
- If the repository name is anything else, the site will be served from `/<repository-name>/`.

The Vite config automatically detects this during GitHub Actions builds, so no manual `base` change is needed.
