# AquaSens-Vélez

Prototipo académico de bajo nivel para avisar, verificar y seguir los cortes de agua potable en Vélez, Santander.
Proyecto de Ingeniería I (202337120) · Universidad Nacional Abierta y a Distancia (UNAD) · Grupo 140 · 2026.

**Abrir el prototipo:** https://brayantirado.github.io/aquasens-velez/

## Qué hace

- **Vecinos:** estado del agua por sector (solo daños confirmados), aviso en menos de un minuto y seguimiento con un código.
- **Operador:** sensores de presión en vivo, alertas que una persona confirma o descarta, órdenes de trabajo y mapa interno.
- **Pruebas:** escenarios (fuga, presión alta, sensor sin señal, lectura imposible, avisos de vecinos y avisos repetidos) y 17 pruebas automáticas cuyo resultado se calcula al ejecutarlas.
- **Resultados:** matriz de KPI con meta, resultado, porcentaje de cumplimiento y desviación; indicadores en vivo; registros descargables en CSV.
- **Cómo funciona:** correspondencia con los seis bloques de la arquitectura de la Etapa 3 y qué es real y qué es simulado.

## Alcance

Los sensores, los vecinos de los escenarios y los mensajes son **simulados**. La lógica (validación, detección, decisión humana, mantenimiento, bitácora encadenada con SHA-256 y cálculo de indicadores) se ejecuta de verdad en el navegador. No está conectado al acueducto real.

Sin librerías ni servicios externos: HTML, CSS y JavaScript.
