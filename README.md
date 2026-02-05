# SSL Certificate Generator con Let's Encrypt

Sistema web para generar certificados SSL gratuitos.

## 📁 Estructura

```
certificados/           ← Se sincroniza con el hosting
├── index.html          ← Página principal
├── assets/             ← CSS y JS
├── _source/            ← Código fuente (para desarrollo)
│   ├── src/            ← Componentes React
│   ├── n8n-workflows/  ← Importar en n8n
│   └── package.json
└── README.md
```

## 🚀 Para el Hosting

Este repo está listo para sincronizar directamente con `public_html/certificados/`.

## 🔧 Importar Workflows en n8n

1. Abre https://flow1.lsnetinformatica.com.ar
2. Ve a Workflows → Import from File
3. Importa los archivos de `_source/n8n-workflows/`:
   - `generate-challenge.json`
   - `get-certificate.json`
4. **Activa ambos workflows**

## ⚠️ Cambiar a Producción

Los workflows usan **staging** (certificados de prueba).

Para certificados reales, edita el nodo "Generate Keys":
```javascript
// Cambiar de STAGING_DIRECTORY a PRODUCTION_DIRECTORY
const DIRECTORY_URL = PRODUCTION_DIRECTORY;
```

## 🛠️ Desarrollo

```bash
cd _source
npm install
npm run dev
npm run build
# Copiar dist/* a la raíz
```

---
Desarrollado por [LSNet Informática](https://lsnetinformatica.com.ar)
