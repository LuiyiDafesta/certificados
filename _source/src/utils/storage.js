// LocalStorage keys
const STORAGE_KEYS = {
    EMAILS: 'ssl_saved_emails',
    LAST_EMAIL: 'ssl_last_email',
    DOMAINS: 'ssl_certified_domains'
};

/**
 * Obtener lista de emails guardados
 */
export function getSavedEmails() {
    try {
        const raw = localStorage.getItem(STORAGE_KEYS.EMAILS);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

/**
 * Guardar un email en el historial y marcarlo como último usado
 */
export function saveEmail(email) {
    if (!email || typeof email !== 'string') return;
    const cleanEmail = email.trim();
    if (!cleanEmail.includes('@')) return;

    try {
        const list = getSavedEmails();
        const filtered = list.filter(e => e.toLowerCase() !== cleanEmail.toLowerCase());
        const updated = [cleanEmail, ...filtered].slice(0, 10); // Guardar hasta 10 emails
        localStorage.setItem(STORAGE_KEYS.EMAILS, JSON.stringify(updated));
        localStorage.setItem(STORAGE_KEYS.LAST_EMAIL, cleanEmail);
    } catch (err) {
        console.error('Error guardando email en localStorage:', err);
    }
}

/**
 * Obtener el último email utilizado
 */
export function getLastEmail() {
    try {
        return localStorage.getItem(STORAGE_KEYS.LAST_EMAIL) || '';
    } catch {
        return '';
    }
}

/**
 * Eliminar un email guardado
 */
export function removeSavedEmail(email) {
    try {
        const list = getSavedEmails().filter(e => e.toLowerCase() !== email.toLowerCase());
        localStorage.setItem(STORAGE_KEYS.EMAILS, JSON.stringify(list));
        if (getLastEmail().toLowerCase() === email.toLowerCase()) {
            localStorage.setItem(STORAGE_KEYS.LAST_EMAIL, list[0] || '');
        }
    } catch (err) {
        console.error('Error eliminando email:', err);
    }
}

/**
 * Obtener lista de dominios certificados previamente
 */
export function getCertifiedDomains() {
    try {
        const raw = localStorage.getItem(STORAGE_KEYS.DOMAINS);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

/**
 * Guardar un dominio certificado con su tipo, fecha y expiración estimada (90 días)
 */
export function saveCertifiedDomain({ domains, certificateType, email, issuedAt }) {
    if (!domains || domains.length === 0) return;

    const validDomains = domains.filter(d => d && d.trim().length > 0);
    if (validDomains.length === 0) return;

    const issueDate = issuedAt ? new Date(issuedAt) : new Date();
    const expireDate = new Date(issueDate.getTime() + 90 * 24 * 60 * 60 * 1000);

    const mainDomain = validDomains.find(d => !d.startsWith('*.')) || validDomains[0];
    const id = mainDomain.toLowerCase().replace(/[^a-z0-9.-]/g, '');

    const record = {
        id,
        mainDomain,
        domains: validDomains,
        certificateType: certificateType || 'single',
        email: email || '',
        issuedAt: issueDate.toISOString(),
        expiresAt: expireDate.toISOString()
    };

    try {
        const list = getCertifiedDomains();
        // Quitar si ya existía para ponerlo primero (actualizado)
        const filtered = list.filter(item => item.id !== id);
        const updated = [record, ...filtered].slice(0, 30); // Guardar hasta 30 dominios
        localStorage.setItem(STORAGE_KEYS.DOMAINS, JSON.stringify(updated));
    } catch (err) {
        console.error('Error guardando dominio en localStorage:', err);
    }
}

/**
 * Eliminar un dominio del historial
 */
export function removeCertifiedDomain(id) {
    try {
        const list = getCertifiedDomains().filter(item => item.id !== id);
        localStorage.setItem(STORAGE_KEYS.DOMAINS, JSON.stringify(list));
    } catch (err) {
        console.error('Error eliminando dominio:', err);
    }
}

/**
 * Calcular días restantes hasta la expiración
 */
export function getDaysRemaining(expiresAt) {
    if (!expiresAt) return 0;
    const now = new Date();
    const expire = new Date(expiresAt);
    const diffTime = expire.getTime() - now.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Formatear fecha para URL de Google Calendar (YYYYMMDD)
 */
function toCalendarDateStr(date) {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const d = String(date.getUTCDate()).padStart(2, '0');
    return `${y}${m}${d}`;
}

/**
 * Generar enlace de Google Calendar con recordatorio 15 días antes de vencer
 */
export function generateGoogleCalendarUrl({ domains, email, expiresAt, reminderDaysBefore = 15 }) {
    const validDomains = Array.isArray(domains) ? domains : [domains];
    const mainDomain = validDomains.find(d => d && !d.startsWith('*.')) || validDomains[0] || 'Mi Dominio';

    const expireDate = expiresAt ? new Date(expiresAt) : new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
    
    // Fecha del evento: reminderDaysBefore días antes del vencimiento
    let eventDate = new Date(expireDate.getTime() - reminderDaysBefore * 24 * 60 * 60 * 1000);
    // Si la fecha ya pasó (por ejemplo si quedan menos de 15 días), ponerlo mañana
    if (eventDate.getTime() < Date.now()) {
        eventDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
    }

    const nextDay = new Date(eventDate.getTime() + 24 * 60 * 60 * 1000);
    const datesParam = `${toCalendarDateStr(eventDate)}/${toCalendarDateStr(nextDay)}`;

    const title = `Renovar Certificado SSL: ${mainDomain}`;
    
    const details = [
        `Recordatorio de renovación de certificado SSL de Let's Encrypt.`,
        ``,
        `🌐 Dominios incluidos:`,
        ...validDomains.map(d => ` • ${d}`),
        ``,
        `📅 Vencimiento exacto: ${expireDate.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })}`,
        email ? `✉️ Email de registro: ${email}` : '',
        ``,
        `⚡ Renovar certificado aquí:`,
        `https://lsnetinformatica.com.ar/certificados/`
    ].filter(Boolean).join('\n');

    const params = new URLSearchParams({
        action: 'TEMPLATE',
        text: title,
        dates: datesParam,
        details: details,
        location: 'https://lsnetinformatica.com.ar/certificados/'
    });

    return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
