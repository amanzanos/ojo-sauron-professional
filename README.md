# Ojo de Sauron Professional

Aplicación profesional de análisis facial en tiempo real usando cámara, MediaPipe Face Landmarker y motor modular de métricas.

## Funciones

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

## Nota técnica

La app detecta patrones visuales observables. No debe usarse para afirmar si una persona miente, es peligrosa o cuál es su intención. Los índices de tensión, fatiga o atención son estimaciones visuales.
# Ojo-de-Dios
