import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
export default defineConfig([...nextVitals, globalIgnores(['.next/**', '.runtime/**', '.npm-cache/**', 'node_modules/**', 'data/**', 'test-results/**'])]);
