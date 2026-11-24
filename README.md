# SSL Certificate Generator con Let's Encrypt

Sistema web completo para generar certificados SSL gratuitos mediante validación DNS-01 (Single, Multi-dominio y Wildcard).

---

## 📁 Arquitectura y Estructura

```text
Letsencrypt/
├── index.html           ← Archivo de producción (sincronizado con hosting /certificados/)
├── assets/              ← Bundles CSS/JS de producción
├── package.json         ← Scripts de conveniencia para desarrollo raíz
├── README.md
└── _source/             ← Código fuente del proyecto
    ├── src/             ← Frontend React (Vite + CSS)
    ├── ssl-api/         ← Backend API en Node.js/Express (desplegado en Dokploy)
    │   ├── app.js       ← Lógica ACME y validación DNS
    │   ├── Dockerfile   ← Configuración para Dokploy / Docker
    │   └── package.json
    └── package.json     ← Dependencias del frontend
```

---

## ⚙️ Componentes

1. **Frontend (React + Vite):**
   * Ubicación: `_source/`
   * Permite solicitar dominios únicos, múltiples, wildcard (`*.ejemplo.com`) y wildcard + base.
   * Muestra las instrucciones y registros TXT necesarios para configurar en el DNS.
   * Conecta por defecto a la API en `https://apissl.lsnetinformatica.com.ar` (configurable con `VITE_API_URL`).

2. **Backend API (Node.js + acme-client):**
   * Ubicación: `_source/ssl-api/`
   * Despliegue en Dokploy: puerto `3000`, build con Dockerfile.
   * Maneja el protocolo ACME RFC 8555 con Let's Encrypt.
   * **Verificación de propagación DNS previa:** Consulta servidores DNS públicos (`1.1.1.1` y `8.8.8.8`) antes de notificar a Let's Encrypt, evitando que las órdenes se quemen o invaliden prematuramente.
   * **Soporte completo de Wildcards:** Conserva los identificadores `*.dominio.com` requeridos por ACME.

---

## 🛠️ Desarrollo Local

Desde la raíz del proyecto:

```bash
# Instalar todas las dependencias (frontend y backend)
npm run install:all

# Iniciar el backend local (puerto 3000)
npm run api

# En otra terminal, iniciar el frontend (Vite en http://localhost:5173)
npm run dev
```

> **Nota:** Para que el frontend local consuma la API local, crea un archivo `_source/.env.local`:
> ```env
> VITE_API_URL=http://localhost:3000
> ```

---

## 🚀 Despliegue en Producción

### 1. Despliegue de la API en Dokploy
1. En Dokploy, crea una nueva **Application**.
2. Fuente: **Git** (este repositorio).
3. Build Type: **Dockerfile**.
4. Contexto de compilación: `_source/ssl-api`.
5. Puerto del contenedor: `3000`.
6. Dominio: `apissl.lsnetinformatica.com.ar`.
7. Variable de entorno (opcional):
   * `ACME_PRODUCTION=true` (para certificados reales de Let's Encrypt)
   * `ACME_PRODUCTION=false` (para entorno de prueba staging)

### 2. Despliegue del Frontend en Hosting (cPanel / Apache)
1. Ejecuta la compilación desde la raíz:
   ```bash
   npm run build
   ```
   *(Esto compila en `_source/dist` y copia automáticamente los archivos a la raíz)*.
2. Sube o sincroniza el contenido de este repositorio con la carpeta `public_html/certificados/` de tu hosting.

---

Desarrollado por [LSNet Informática](https://lsnetinformatica.com.ar)
