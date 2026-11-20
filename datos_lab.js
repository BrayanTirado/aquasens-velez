/* Resultados de las pruebas de laboratorio E1–E6 (prototipo/resultados/analisis.json). */
window.DATOS_LAB = [
 {
  "ind": "Rapidez de respuesta (P95) con 10 consultas/s · versión 2",
  "meta": 2000,
  "op": "<=",
  "u": "ms",
  "res": 1730.9,
  "fuente": "Prueba E1, 3 repeticiones"
 },
 {
  "ind": "Rapidez de respuesta (P95) con 10 consultas/s · versión 3 (WAL)",
  "meta": 2000,
  "op": "<=",
  "u": "ms",
  "res": 27.6,
  "fuente": "Prueba E1, 1 repetición"
 },
 {
  "ind": "Tiempo para publicar el aviso después de confirmar",
  "meta": 300,
  "op": "<=",
  "u": "s",
  "res": 0.037,
  "fuente": "Prueba E3, 80 confirmaciones"
 },
 {
  "ind": "Tiempo hasta la alerta por avisos · regla por sector (la que usa esta versión)",
  "meta": 6,
  "op": "<=",
  "u": "min",
  "res": 5.36,
  "fuente": "Prueba E3, mediana de 40 cortes"
 },
 {
  "ind": "Tiempo hasta la alerta por avisos · regla original de 150 m",
  "meta": 6,
  "op": "<=",
  "u": "min",
  "res": 8.91,
  "fuente": "Prueba E3, mediana de 40 cortes"
 },
 {
  "ind": "Falsas alarmas por avisos en 30 días normales",
  "meta": 0.1,
  "op": "<=",
  "u": "%",
  "res": 0,
  "fuente": "Prueba E3, 450 avisos"
 },
 {
  "ind": "Avisos repetidos que se juntan bien · GPS de 15 m",
  "meta": 85,
  "op": ">=",
  "u": "%",
  "res": 100.0,
  "fuente": "Prueba E4, 50 pares"
 },
 {
  "ind": "Avisos repetidos que se juntan bien · GPS de 60 m",
  "meta": 85,
  "op": ">=",
  "u": "%",
  "res": 76.7,
  "fuente": "Prueba E4, 50 pares"
 },
 {
  "ind": "Casos con todo su historial registrado",
  "meta": 98,
  "op": ">=",
  "u": "%",
  "res": 100.0,
  "fuente": "Prueba E6, 20 casos"
 },
 {
  "ind": "Disponibilidad durante las pruebas (no es mensual)",
  "meta": 99,
  "op": ">=",
  "u": "%",
  "res": 100.0,
  "fuente": "774 consultas en 13,2 min"
 }
];
window.DATOS_SENSORES = {"fugas": 8, "detectadas": 8, "retardo_medio_min": 2.88, "retardo_max_min": 4, "falsas": 0};
