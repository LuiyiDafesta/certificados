# SSL Certificate API

Backend para generar certificados SSL con Let's Encrypt.

## Deploy en Dokploy

1. En Dokploy, crea una nueva **Application**
2. Fuente: **Git** → pega la URL de este repo
3. Build: **Dockerfile**
4. Contexto: `_source/ssl-api`
5. Puerto: `3000`
6. Agrega un dominio (ej: `ssl-api.lsnetinformatica.com.ar`)

### Variables de entorno (opcional)

| Variable | Valor | Descripción |
|----------|-------|-------------|
| `ACME_PRODUCTION` | `false` | Usar `true` para certificados reales |

## Endpoints

- `POST /generate-challenge` - Genera registros DNS
- `POST /get-certificate` - Obtiene el certificado
- `GET /health` - Estado del servidor
