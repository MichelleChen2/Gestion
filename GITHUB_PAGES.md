# Publicar CoopGestión en GitHub Pages

Esta versión incluye una carpeta `docs/` lista para GitHub Pages.

## 1. Subir los archivos al branch `entrega5-fix`

Subir/commitear el proyecto completo, incluyendo `docs/`.

## 2. Configurar GitHub Pages

En el repositorio:

1. `Settings`
2. `Pages`
3. `Build and deployment` → `Deploy from a branch`
4. Branch: `entrega5-fix`
5. Folder: `/docs`
6. `Save`

GitHub Pages publicará el `docs/index.html`, por lo que se verá el login en lugar del README.

## 3. Cuando el backend esté online

GitHub Pages solo aloja el frontend. Para que el login y el resto de la aplicación funcionen, el backend Node/Express también debe estar publicado en HTTPS.

Editar únicamente `docs/config.js`:

```js
window.COOPGESTION_CONFIG = {
  apiBaseUrl: 'https://TU-BACKEND.example.com'
};
```

En el backend, configurar `FRONTEND_ORIGIN` con el origen de GitHub Pages:

```env
FRONTEND_ORIGIN=https://michellechen2.github.io
```

La ruta `/Gestion` no forma parte del origen CORS.

## Importante

- No poner `DATABASE_URL`, contraseñas de Neon ni `JWT_SECRET` dentro de `docs/`.
- `docs/config.js` solo debe contener la URL pública del backend.
- La base PostgreSQL/Neon siempre debe ser accedida por el backend, nunca directamente desde el navegador.
