const quote = (file) => JSON.stringify(file);
module.exports = {
  "*.{json,md,yml,yaml,css,html,js,cjs,mjs}": (files) =>
    `prettier --write ${files.map(quote).join(" ")}`,
  "frontend/**/*.{ts,tsx,js,jsx}": (files) => [
    `prettier --write ${files.map(quote).join(" ")}`,
    `./frontend/node_modules/.bin/eslint --config frontend/eslint.config.js --fix --max-warnings 10 ${files.map(quote).join(" ")}`,
  ],
  "backend/**/*.{ts,tsx,js,jsx}": (files) => [
    `prettier --write ${files.map(quote).join(" ")}`,
    `./backend/node_modules/.bin/eslint --config backend/eslint.config.js --fix --max-warnings 10 ${files.map(quote).join(" ")}`,
  ],
};
