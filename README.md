# SSL Certificate Generator con Let's Encrypt

Sistema web para generar certificados SSL gratuitos usando validación DNS-01.

## 📁 Estructura del Proyecto

```
Letsencrypt/
├── dist/                    # Build de producción (subir a Ferozo)
├── src/                     # Código fuente React
│   ├── components/
│   │   ├── CertificateForm.jsx
│   │   ├── DNSRecords.jsx
│   │   └── CertificateDownload.jsx
│   ├── App.jsx
│   ├── main.jsx
│   └── index.css
├── n8n-workflows/           # Importar en n8n
│   ├── generate-challenge.json
│   └── get-certificate.json
└── package.json
```

## 🚀 Deploy en Ferozo

### 1. Subir Frontend

1. Conecta por FTP a tu hosting de Ferozo
2. Navega a `public_html/certificados/`
3. Sube **todo el contenido** de la carpeta `dist/`:
   ```
   dist/
   ├── index.html
   └── assets/
       ├── index-*.css
       └── index-*.js
   ```

### 2. Importar Workflows en n8n

1. Abre tu n8n: https://flow1.lsnetinformatica.com.ar
2. Ve a **Workflows** → **Import from File**
3. Importa los dos archivos:
   - `n8n-workflows/generate-challenge.json`
   - `n8n-workflows/get-certificate.json`
4. **Activa** ambos workflows (toggle en la esquina superior derecha)

### 3. Verificar Webhooks

Los webhooks se crean automáticamente:
- `https://flow1.lsnetinformatica.com.ar/webhook/generate-challenge`
- `https://flow1.lsnetinformatica.com.ar/webhook/get-certificate`

## 🔧 Cambiar de Staging a Producción

Los workflows están configurados para usar **staging** (certificados de prueba).

Para obtener certificados **reales**, edita el nodo "Generate Keys" en el workflow "Generate Challenge":

```javascript
// Cambiar de:
const DIRECTORY_URL = STAGING_DIRECTORY;

// A:
const DIRECTORY_URL = PRODUCTION_DIRECTORY;
```

## 📜 Tipos de Certificados Soportados

| Tipo | Descripción |
|------|-------------|
| **Dominio Único** | Un solo dominio (ej: ejemplo.com) |
| **Multi-dominio (SAN)** | Hasta 100 dominios en un certificado |
| **Wildcard** | Todos los subdominios (ej: *.ejemplo.com) |
| **Wildcard + Base** | Dominio base + todos los subdominios |

## ⚠️ Notas Importantes

1. **Los certificados expiran en 90 días** - Recuerda renovarlos
2. **Límites de producción**: 50 certificados por dominio registrado por semana
3. **Propagación DNS**: Esperar 2-5 minutos después de configurar registros TXT
4. **Staging**: Los certificados de staging no son válidos para navegadores

## 🛠️ Desarrollo Local

```bash
# Instalar dependencias
npm install

# Ejecutar en desarrollo
npm run dev

# Build para producción
npm run build
```

## 📞 Soporte

Desarrollado por [LSNet Informática](https://lsnetinformatica.com.ar)
