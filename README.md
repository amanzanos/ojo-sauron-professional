# WEROS

Red ciudadana para situaciones de calle: reporta y consulta incidentes cercanos en un mapa en vivo, envía una alerta SOS con tu ubicación y los últimos 20 segundos grabados a un contacto de confianza, y activa un modo de vigilancia con cámara con análisis conductual en tiempo real.

## Funciones

### Comunidad (feed ciudadano)
- Publica reportes categorizados (robo, accidente, incendio, disturbio, actividad sospechosa, petición de ayuda, otros) con ubicación automática.
- Feed en vivo ordenado por recencia, visible para cualquiera con la app abierta.

### Mapa
- Mapa de la ciudad (Leaflet + OpenStreetMap) con todos los eventos reportados, coloreados por categoría, con leyenda y centrado en tu ubicación.

### Botón de alerta (SOS)
- Botón flotante siempre visible. Al confirmarlo:
  - Comparte tu ubicación en tiempo real con tu contacto de emergencia por WhatsApp/SMS (enlace `wa.me`, configurable desde el propio botón).
  - Graba en bucle los últimos ~20 segundos de cámara y micrófono (buffer circular) y te deja descargarlos o compartirlos junto con la alerta.
  - Publica automáticamente un evento de tipo "Alerta SOS" en el feed y el mapa para que la comunidad lo vea.
  - Anuncia por voz (síntesis del navegador) "Alerta enviada a tu contacto de emergencia" — WEROS nunca dice que avisó a la policía, porque no tiene ninguna integración real con ningún cuerpo de seguridad.
- **Detección automática de sonido de auxilio**: con la pestaña "Vigilancia" abierta y el audio activado, si el clasificador de sonido ambiente detecta un grito, un disparo o una explosión, se abre solo el flujo de alerta con una cuenta atrás cancelable de 8s (con aviso por voz) en vez de un botón que alguien tiene que pulsar a tiempo.

### Saludo diario
- Al abrir la app por primera vez ese día aparece una franja "Buenos días/tardes/noches — toca para tu saludo". Los navegadores bloquean el audio automático sin gesto del usuario, así que no suena solo: hay que tocar "Empezar mi día".
- Al tocarlo: WEROS te saluda por voz, consulta el tiempo de hoy (Open-Meteo, gratis, sin API key, usando tu ubicación) y te da un resumen rápido de cuántas incidencias se han reportado hoy en la comunidad.
- Opcionalmente intenta reproducir un jingle local (`public/audio/back-in-black.mp3`) de fondo mientras habla, con fundido de salida al terminar. **Esa carpeta está excluida de git a propósito** (ver `public/audio/README.md`) — un archivo de música con copyright no puede subirse a un repo/despliegue público sin infringir derechos de autor. En tu máquina, coloca tu propio archivo ahí y sonará con `npm run dev`; en la versión pública de Vercel esa carpeta no existe, así que el saludo funciona igual pero solo con voz + tiempo, sin música.
- También puedes preguntar el tiempo en cualquier momento por voz: "qué tiempo hace".

### Asistente de voz (estilo Jarvis, sin coste)
- Botón flotante (esquina inferior izquierda) con reconocimiento de voz del navegador (Web Speech API) — sin servidor propio ni clave de API. Funciona en navegadores basados en Chromium (Chrome, Edge, Android); Firefox y Safari de escritorio no lo soportan, así que el botón simplemente no aparece ahí. **Aviso honesto**: en Chrome, el propio navegador procesa el audio a través de los servidores de reconocimiento de voz de Google (no es 100% local) — WEROS no interviene en ese envío ni lo recibe, pero no es un secreto que nadie oye.
- **Modo manos libres** ("Oye WEROS, ..."): chip activable junto al botón. Con él activado, escucha en bucle y solo actúa cuando el audio empieza con la palabra de activación — el resto del sonido ambiente se descarta sin procesar. Se pausa automáticamente mientras WEROS habla, para no escucharse a sí mismo.
- **Notificaciones del navegador**: chip para pedir permiso y activar avisos — cuando se envía una alerta SOS, cuando aparece un reporte ciudadano nuevo a menos de 2km de ti, y cada 5 minutos mientras el modo testigo sigue grabando. Solo funcionan mientras WEROS está abierto (aunque sea en segundo plano); si cierras el navegador del todo no llegan — eso requeriría push real con un backend dedicado.
- Comandos reconocidos: **"abre el mapa / comunidad / vigilancia"**, **"activa el modo testigo"** / **"detener grabación"**, **"envía alerta"** / **"necesito ayuda"** (misma cuenta atrás cancelable que la detección automática de sonido), **"llama a mi contacto"**, **"qué hay cerca de mí"**, **"lee los últimos reportes"**, **"cómo estoy"** (resumen de pestaña/estado de grabación), **"qué hora es"**, **"cuánta batería tengo"** y **"vibra"**.
- Respuestas con variación (no siempre la misma frase) para sonar menos a script y más a asistente — pero sigue siendo reconocimiento de comandos por palabras clave, no una IA conversacional libre. Para eso haría falta una API de lenguaje con coste y un backend que la proteja (fase 2 posible, no implementada).

### Modo testigo
- Graba con la cámara trasera y el micrófono de forma continua (no solo 20s) mientras caminas por una zona que te preocupa, con vista previa en vivo y contador de tiempo.
- Al detener, la grabación queda para descargar o compartir — se guarda solo en tu dispositivo, WEROS no la sube a ningún sitio.

### Vigilancia (cámara)
- Interfaz HUD táctica a pantalla completa con panel lateral por pestañas (Resumen / Métricas / Emociones / Gestos / Eventos).
- Detección facial con MediaPipe Face Landmarker, pose de cabeza calculada a partir de la matriz de transformación 3D real del modelo.
- Detección de gestos de manos con MediaPipe Gesture Recognizer: pulgar arriba/abajo, victoria, palma abierta, puño, señalar, "te quiero", más heurísticas propias para seña de OK 👌 y corazón con dos manos 🫶, y detección de autocontacto mano-rostro.
- Estimación de emoción dominante y distribución emocional completa.
- Índices compuestos: compromiso (engagement) y estrés.
- Atención, contacto visual, mirada, fatiga, tensión, expresividad, inquietud motora y asimetría gestual.
- Parpadeos por minuto y duración media real de parpadeo.
- Ceño fruncido, cejas levantadas, sonrisa, boca tensa, bostezo sostenido, ojos abiertos, cabeza girada/inclinada.
- Indicadores de calidad de señal, iluminación y encuadre para explicar detecciones deficientes.
- Eventos significativos con histórico combinado (rostro + gestos) y contador de gestos por sesión.
- Alertas apiladas sin solapes, con severidad e icono.
- Gráficas temporales de compromiso, estrés y atención.
- Preparado para Vercel.

## Instalar

```bash
npm install
npm run dev
```

Abrir:

```text
http://localhost:5173
```

## Móvil

Para móvil usa HTTPS. Lo más cómodo es desplegar en Vercel:

```bash
npm run build
vercel --prod
```

## Feed y mapa ciudadano — backend opcional

El feed y el mapa funcionan sin backend: los reportes se guardan en el `localStorage` del navegador de cada persona (solo visibles para quien los creó). Para que los reportes se compartan de verdad entre vecinos, configura el mismo backend de `server/` (ver abajo) — expone `GET/POST /public/events`, sin necesidad de `API_KEY` ya que los reportes ciudadanos son públicos por diseño. Con `VITE_API_URL` configurado, la app usa automáticamente el backend en vez de `localStorage`.

## Analítica de zonas (tienda) — backend + base de datos

El modo "Tienda" (ocupación/visitas anónimas y agregadas por zona dibujada sobre la cámara) es opcional y requiere un backend aparte con Postgres. Sin configurarlo, el resto de la app funciona igual — las zonas simplemente no persisten en ningún lado. El esquema no guarda identidad de visitante en ningún campo: solo zona, duración y momento de cada visita.

### 1. Desplegar el backend + Postgres en Railway

1. Crear cuenta en [railway.app](https://railway.app) y un proyecto nuevo desde este repositorio de GitHub, seleccionando `server/` como directorio raíz del servicio (Railway lo detecta como Node automáticamente: `npm install && npm run build && npm start`).
2. Agregar un plugin de **PostgreSQL** al proyecto (un clic) — Railway expone `DATABASE_URL` automáticamente al servicio.
3. En las variables de entorno del servicio, agregar:
   - `API_KEY` — una clave larga y aleatoria (ej. generada con `openssl rand -hex 32`). Protege las rutas de escritura de la API.
   - `STORE_TIMEZONE` — zona horaria de la tienda para calcular "hoy" (ej. `Europe/Madrid`).
4. Desplegar. Railway te da una URL pública (ej. `https://tu-proyecto.up.railway.app`).

### 2. Desplegar el frontend en Vercel

1. Crear cuenta en [vercel.com](https://vercel.com) e importar este mismo repositorio (usa `vercel.json` ya incluido, detecta Vite automáticamente).
2. En las variables de entorno del proyecto de Vercel, agregar:
   - `VITE_API_URL` — la URL pública del backend en Railway (paso anterior).
   - `VITE_API_KEY` — la misma `API_KEY` que configuraste en Railway.
3. Desplegar.

**Aviso de seguridad honesto**: como el frontend es una SPA pública, `VITE_API_KEY` viaja en el código que se descarga al navegador — es un freno básico contra abuso casual (alguien copiando la URL de la API y jugando con ella), no autenticación real. Si en algún momento necesitás proteger esto en serio (por ejemplo si vas a exponer un panel de administración), es una conversación aparte sobre agregar login real.

### Desarrollo local con base de datos

```bash
cd server
cp .env.example .env   # completar DATABASE_URL de tu Postgres local, API_KEY, etc.
npm install
npm run dev            # http://localhost:8787, crea las tablas solo si no existen
```

En la raíz del proyecto:

```bash
cp .env.example .env   # VITE_API_URL=http://localhost:8787, VITE_API_KEY igual al del backend
npm run dev
```

## Nota técnica

La app detecta patrones visuales observables. No debe usarse para afirmar si una persona miente, es peligrosa o cuál es su intención. Los índices de tensión, fatiga o atención son estimaciones visuales. Los reportes del feed ciudadano son generados por otras personas usuarias, no verificados por WEROS — trátalos como avisos de la comunidad, no como hechos confirmados.
