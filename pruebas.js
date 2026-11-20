/* Pruebas automáticas de la lógica del prototipo. Cada prueba crea un motor nuevo
   y el veredicto se calcula al ejecutarla. */
(function (global) {
  "use strict";
  const { Motor } = global.AquaSens;
  const num = x => String(Math.round(x * 100) / 100).replace(".", ",");
  const EST = { recibido: "recibido", probable: "en revisión", confirmado: "confirmado", en_atencion: "en atención", solucionado: "solucionado", cerrado: "cerrado", descartada: "descartado", normal: "normal" };

  function nuevo() { return new Motor({ semilla: 7 }); }

  const PRUEBAS = [
    ["P01", "Lectura normal de 40 m.c.a.", "Se acepta, estado normal y sin alerta", () => {
      const m = nuevo(); const r = m.medir({ nodo: 1, presion: 40 });
      return { ok: r.ok && !r.fuera && m.alertas.length === 0, obt: (r.ok ? "Aceptada" : "Rechazada") + ", " + (r.fuera ? "fuera de rango" : "normal") + ", " + m.alertas.length + " alertas" };
    }],
    ["P02", "Valores límite 32 y 48 m.c.a.", "Ambos son normales (los límites están incluidos)", () => {
      const m = nuevo(); const a = m.medir({ nodo: 1, presion: 32 }), b = m.medir({ nodo: 1, presion: 48 });
      return { ok: !a.fuera && !b.fuera, obt: "32 → " + (a.fuera ? "fuera" : "normal") + "; 48 → " + (b.fuera ? "fuera" : "normal") };
    }],
    ["P03", "Presión baja: 31,9 m.c.a.", "Con 1 lectura no alerta; con 2 seguidas sí", () => {
      const m = nuevo(); m.medir({ nodo: 2, presion: 31.9 }); const tras1 = m.alertas.length;
      m.medir({ nodo: 2, presion: 31.9 }); const tras2 = m.alertas.length;
      return { ok: tras1 === 0 && tras2 === 1, obt: "Tras 1 lectura: " + tras1 + " alertas; tras 2: " + tras2 };
    }],
    ["P04", "Presión alta: 48,1 m.c.a.", "Con 2 lecturas seguidas genera 1 alerta", () => {
      const m = nuevo(); m.medir({ nodo: 3, presion: 48.1 }); m.medir({ nodo: 3, presion: 48.1 });
      return { ok: m.alertas.length === 1, obt: m.alertas.length + " alerta(s)" };
    }],
    ["P05", "Lecturas imposibles o incompletas (−5, 200 y vacío)", "Las 3 se rechazan y ninguna se guarda", () => {
      const m = nuevo(); const r = [-5, 200, ""].map(v => m.medir({ nodo: 1, presion: v }));
      const rech = r.filter(x => !x.ok).length;
      return { ok: rech === 3 && m.recibidas === 0, obt: rech + " rechazadas, " + m.recibidas + " guardadas" };
    }],
    ["P06", "Sensor 5 deja de enviar datos", "Sin alerta a los 2 min; alerta «sin comunicación» a los 3 min", () => {
      const m = nuevo(); m.paso(); m.nodos[5].sinSenalForzada = true;
      const senal = () => m.alertas.filter(a => a.origen === "comunicacion").length;
      m.paso(); m.paso(); const a2 = senal(); m.paso(); const a3 = senal();
      return { ok: a2 === 0 && a3 === 1, obt: "A los 2 min: " + a2 + "; a los 3 min: " + a3 };
    }],
    ["P07", "Fuga en el sensor 3", "Se detecta en 4 minutos o menos", () => {
      const m = nuevo(); m.paso(); m.nodos[3].fuga = m.t; const t0 = m.t; let min = null;
      for (let i = 0; i < 15 && min === null; i++) { m.paso(); if (m.alertas.some(a => a.origen === "sensor" && m.incidencias.find(x => x.id === a.inc).nodo === 3)) min = (m.t - t0) / 60; }
      return { ok: min !== null && min <= 4, obt: min === null ? "No se detectó en 15 min" : "Detectada a los " + min + " min" };
    }],
    ["P08", "Avisos de vecinos del sector 7", "2 avisos no alertan; el 3.º en menos de 30 min sí", () => {
      const m = nuevo(); m.reportar({ sector: 7, tipo: "interrupcion" }); m.t += 300; m.reportar({ sector: 7, tipo: "interrupcion" });
      const con2 = m.alertas.length; m.t += 300; const r = m.reportar({ sector: 7, tipo: "interrupcion" });
      return { ok: con2 === 0 && m.alertas.length === 1 && r.estado === "probable", obt: "Con 2: " + con2 + " alertas; con 3: " + m.alertas.length + " (estado: " + EST[r.estado] + ")" };
    }],
    ["P09", "5 avisos repetidos del mismo problema", "Quedan en 1 solo caso con 5 avisos", () => {
      const m = nuevo(); for (let i = 0; i < 5; i++) { m.reportar({ sector: 2, tipo: "fuga" }); m.t += 60; }
      const casos = m.incidencias.filter(i => i.origen !== "sensor");
      return { ok: casos.length === 1 && casos[0].nReportes === 5, obt: casos.length + " caso(s), " + (casos[0] ? casos[0].nReportes : 0) + " avisos" };
    }],
    ["P10", "El operador descarta una alerta", "No se publica: 0 mensajes y el sector sigue normal", () => {
      const m = nuevo(); for (let i = 0; i < 3; i++) m.reportar({ sector: 9, tipo: "interrupcion" });
      m.decidir(m.alertas[0].id, "descartar"); const s = m.estadoPublico().sectores[9];
      return { ok: m.notificaciones === 0 && s === "normal", obt: m.notificaciones + " mensajes; sector 9: " + EST[s] };
    }],
    ["P11", "El operador confirma una alerta", "Avisa a los 100 usuarios del sector (15 por SMS) en ≤ 5 min", () => {
      const m = nuevo(); for (let i = 0; i < 3; i++) m.reportar({ sector: 4, tipo: "interrupcion" });
      const r = m.decidir(m.alertas[0].id, "confirmar");
      return { ok: r.notificados === 100 && r.sms === 15 && r.ms <= 300000, obt: r.notificados + " avisados, " + r.sms + " por SMS, en " + num(r.ms) + " ms" };
    }],
    ["P12", "Cerrar un daño sin decir qué se hizo", "No se permite; con la acción escrita sí", () => {
      const m = nuevo(); for (let i = 0; i < 3; i++) m.reportar({ sector: 1, tipo: "fuga" });
      m.decidir(m.alertas[0].id, "confirmar"); const id = m.alertas[0].inc; m.avanzar(id);
      const sin = m.avanzar(id, ""), con = m.avanzar(id, "Cambio de tubo de 3 pulgadas");
      return { ok: !sin.ok && con.ok, obt: "Sin acción: " + (sin.ok ? "permitido" : "bloqueado") + "; con acción: " + (con.ok ? EST[con.estado] : "bloqueado") };
    }],
    ["P13", "3 vecinos responden «todavía no tengo agua»", "El caso se reabre y vuelve a atención", () => {
      const m = nuevo(); const cods = [];
      for (let i = 0; i < 3; i++) cods.push(m.reportar({ sector: 6, tipo: "interrupcion" }).codigo);
      m.decidir(m.alertas[0].id, "confirmar"); const id = m.alertas[0].inc; m.avanzar(id); m.avanzar(id, "Reparación");
      cods.forEach(c => m.sigoSinAgua(c));
      const e = m.incidencias.find(i => i.id === id).estado;
      return { ok: e === "en_atencion", obt: "Estado final: " + EST[e] };
    }],
    ["P14", "Bitácora encadenada (SHA-256)", "Íntegra al inicio; si se altera un evento, se detecta cuál", () => {
      const m = nuevo(); for (let i = 0; i < 5; i++) m.paso();
      const v1 = m.verificarBitacora(); m.bitacora[7].datos = m.bitacora[7].datos.replace(/\d/, "9"); const v2 = m.verificarBitacora();
      return { ok: v1.integra && !v2.integra && v2.fallaEn === 8, obt: (v1.integra ? "Íntegra" : "Alterada") + " (" + v1.revisados + " eventos); tras alterar el evento 8: " + (v2.integra ? "no detectó" : "detectó falla en el evento " + v2.fallaEn) };
    }],
    ["P15", "Índice de prioridad (ejemplo de la Etapa 3)", "Sector completo, 6 h sin agua y centro de salud: IP = 0,775", () => {
      const m = nuevo(); m.t = 12 * 3600; const inc = m._nuevaIncidencia({ sector: 4, tipo: "baja_presion", origen: "sensor", estado: "probable", tCreada: 6 * 3600 });
      const ip = m.prioridad(inc);
      return { ok: Math.abs(ip - 0.775) < 1e-9, obt: "IP = " + ip.toFixed(3).replace(".", ",") };
    }],
    ["P16", "Nada se publica sin verificación humana", "Con la alerta pendiente el mapa público sigue normal; al confirmar, cambia", () => {
      const m = nuevo(); for (let i = 0; i < 3; i++) m.reportar({ sector: 5, tipo: "interrupcion" });
      const antes = m.estadoPublico().sectores[5], interno = m.estadoPublico(true).sectores[5];
      m.decidir(m.alertas[0].id, "confirmar"); const despues = m.estadoPublico().sectores[5];
      return { ok: antes === "normal" && interno === "probable" && despues === "confirmado", obt: "Público antes: " + EST[antes] + " (operador: " + EST[interno] + "); público tras confirmar: " + EST[despues] };
    }],
    ["P17", "Mapa público sin datos personales", "Solo muestra el estado por sector, sin códigos ni canales", () => {
      const m = nuevo(); m.reportar({ sector: 3, tipo: "calidad", canal: "linea" }); const pub = JSON.stringify(m.estadoPublico());
      const limpio = !/AQ-|linea|canal|codigo/.test(pub);
      return { ok: limpio, obt: limpio ? "Solo estados por sector" : "Contiene datos personales" };
    }]
  ];

  function ejecutar() {
    return PRUEBAS.map(([cod, nombre, esperado, fn]) => {
      const t0 = performance.now();
      let r;
      try { r = fn(); } catch (e) { r = { ok: false, obt: "Error: " + e.message }; }
      return { cod, nombre, esperado, obtenido: r.obt, ok: !!r.ok, ms: performance.now() - t0 };
    });
  }

  global.PruebasAquaSens = { ejecutar, total: PRUEBAS.length };
})(window);
