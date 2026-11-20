/* AquaSens-Vélez — motor del prototipo (lógica de los 6 bloques de la Etapa 3).
   Corre completo en el navegador. Todo dato de sensores es SIMULADO. */
(function (global) {
  "use strict";

  // ---------- SHA-256 (para la bitácora encadenada) ----------
  function sha256(ascii) {
    function rr(v, a) { return (v >>> a) | (v << (32 - a)); }
    const K = [], H = [], P = [];
    let c = 2;
    while (K.length < 64) {
      let primo = true;
      for (let i = 0; i < P.length && P[i] * P[i] <= c; i++) if (c % P[i] === 0) { primo = false; break; }
      if (primo) { P.push(c); if (H.length < 8) H.push((Math.pow(c, 1 / 2) * 4294967296) | 0); K.push((Math.pow(c, 1 / 3) * 4294967296) | 0); }
      c++;
    }
    const bytes = new TextEncoder().encode(ascii);
    const l = bytes.length * 8;
    const m = [];
    for (let i = 0; i < bytes.length; i++) m[i >> 2] |= bytes[i] << (24 - (i % 4) * 8);
    m[l >> 5] |= 0x80 << (24 - (l % 32));
    m[(((l + 64) >> 9) << 4) + 15] = l;
    const h = H.slice();
    const bloques = (((l + 64) >> 9) << 4) + 16;
    for (let j = 0; j < bloques; j += 16) {
      const w = Array.from({ length: 16 }, (_, k) => m[j + k] | 0);
      const o = h.slice();
      for (let i = 0; i < 64; i++) {
        const w15 = w[i - 15], w2 = w[i - 2];
        const a = h[0], e = h[4];
        if (i >= 16) w[i] = (w[i - 16] + (rr(w15, 7) ^ rr(w15, 18) ^ (w15 >>> 3)) + w[i - 7] + (rr(w2, 17) ^ rr(w2, 19) ^ (w2 >>> 10))) | 0;
        const t1 = (h[7] + (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25)) + ((e & h[5]) ^ (~e & h[6])) + K[i] + w[i]) | 0;
        const t2 = ((rr(a, 2) ^ rr(a, 13) ^ rr(a, 22)) + ((a & h[1]) ^ (a & h[2]) ^ (h[1] & h[2]))) | 0;
        h.unshift((t1 + t2) | 0);
        h[4] = (h[4] + t1) | 0;
        h.length = 8;
      }
      for (let i = 0; i < 8; i++) h[i] = (h[i] + o[i]) | 0;
    }
    return h.map(x => (x >>> 0).toString(16).padStart(8, "0")).join("");
  }

  // ---------- Parámetros de diseño (Etapa 3) ----------
  const CFG = {
    SECTORES: 12, USUARIOS_POR_SECTOR: 100, FRACCION_SMS: 0.15,
    P_MIN: 32, P_MAX: 48, P_IMPOSIBLE_MIN: 0, P_IMPOSIBLE_MAX: 120,
    MUESTRAS_CONSECUTIVAS: 2, MUESTREO_S: 60, SIN_SENAL_MUESTRAS: 3,
    K_REPORTES: 3, VENTANA_K: 30 * 60, VENTANA_DUP: 2 * 3600,
    NODOS: { 1: [1, 2, 3], 2: [4, 5], 3: [6, 7, 8], 4: [9, 10], 5: [11, 12] },
    NOMBRE_NODO: { 1: "Tanque principal", 2: "Barrio Santander", 3: "Centro", 4: "El Progreso", 5: "Zona Norte" },
    SECTORES_PRIORITARIOS: [4, 7] // centro de salud o colegio (supuesto)
  };
  const TIPOS = { interrupcion: "No llega agua", baja_presion: "Llega muy poca agua", fuga: "Tubo roto o fuga", calidad: "Agua turbia o con olor" };

  function rnd(sem) { // generador pseudoaleatorio reproducible
    let s = sem >>> 0 || 1;
    return function () { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 1e9) / 1e9; };
  }
  function gauss(r) { let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

  function nodoDeSector(s) { for (const n in CFG.NODOS) if (CFG.NODOS[n].includes(s)) return +n; return null; }

  // ---------- Motor ----------
  function Motor(opc) {
    opc = opc || {};
    this.r = rnd(opc.semilla || 20261119);
    this.t = opc.inicio != null ? opc.inicio : 6 * 3600; // segundos simulados desde las 00:00
    this.nodos = {};
    for (let n = 1; n <= 5; n++) this.nodos[n] = { id: n, presion: null, caudal: null, nivel: null, ultimaTs: null, fuga: null, desfase: 0, sinSenal: false, alertaSenal: false };
    this.mediciones = []; this.incidencias = []; this.reportes = []; this.alertas = []; this.ordenes = [];
    this.bitacora = []; this.notificaciones = 0; this.notificacionesSMS = 0;
    this.recibidas = 0; this.rechazadas = []; this.tiemposPublicacion = [];
    this.seq = { inc: 0, al: 0, rep: 0 };
    this.oyentes = [];
  }
  const M = Motor.prototype;

  M.on = function (f) { this.oyentes.push(f); };
  M._emitir = function (ev, datos) { this.oyentes.forEach(f => { try { f(ev, datos); } catch (e) { /* la vista no debe tumbar el motor */ } }); };

  M.registrar = function (evento, datos) {
    const prev = this.bitacora.length ? this.bitacora[this.bitacora.length - 1].hash : "0".repeat(64);
    const texto = JSON.stringify(datos);
    const hash = sha256(prev + "|" + this.t + "|" + evento + "|" + texto);
    this.bitacora.push({ id: this.bitacora.length + 1, t: this.t, evento, datos: texto, prev, hash });
  };
  M.verificarBitacora = function () {
    let prev = "0".repeat(64);
    for (const b of this.bitacora) {
      const h = sha256(prev + "|" + b.t + "|" + b.evento + "|" + b.datos);
      if (b.prev !== prev || b.hash !== h) return { integra: false, revisados: b.id - 1, fallaEn: b.id };
      prev = b.hash;
    }
    return { integra: true, revisados: this.bitacora.length };
  };

  // ---- Modelo de presión (simulado) ----
  M.modeloPresion = function (n) {
    const h = (this.t / 3600) % 24;
    const base = 40 + 3 * Math.cos(2 * Math.PI * (h - 3) / 24) + this.nodos[n].desfase;
    const f = this.nodos[n].fuga;
    let p = base;
    if (f != null && this.t >= f) p = 24 + (base - 24) * Math.exp(-(this.t - f) / 120);
    return Math.round((p + gauss(this.r) * 1.2) * 10) / 10;
  };

  // ---- Bloque 2: validación de mediciones ----
  M.validarMedicion = function (d) {
    if (d.presion === "" || d.presion == null || isNaN(+d.presion)) return "Registro incompleto: falta la presión";
    if (!CFG.NODOS[d.nodo]) return "Nodo desconocido";
    const p = +d.presion;
    if (p < CFG.P_IMPOSIBLE_MIN || p > CFG.P_IMPOSIBLE_MAX) return "Valor físicamente imposible (" + p + " m.c.a.): posible daño del sensor";
    return null;
  };

  // ---- Bloques 1A, 2, 3 y 4: recibir una medición ----
  M.medir = function (d) {
    const error = this.validarMedicion(d);
    if (error) {
      this.rechazadas.push({ t: this.t, nodo: d.nodo, valor: d.presion, motivo: error, origen: d.origen || "manual" });
      this.registrar("medicion_rechazada", { nodo: d.nodo, valor: String(d.presion), motivo: error });
      this._emitir("rechazo", { nodo: d.nodo, motivo: error });
      return { ok: false, motivo: error };
    }
    this.recibidas++;
    const n = this.nodos[d.nodo];
    const p = +d.presion;
    n.presion = p; n.caudal = d.caudal != null ? +d.caudal : Math.round((0.9 * Math.sqrt(Math.max(p, 0)) + gauss(this.r) * 0.2) * 60 * 10) / 10;
    n.nivel = d.nivel != null ? +d.nivel : Math.round((78 + gauss(this.r)) * 10) / 10;
    n.ultimaTs = this.t; n.sinSenal = false; n.alertaSenal = false;
    const fuera = p < CFG.P_MIN || p > CFG.P_MAX;
    if (!fuera) n.silenciado = false; // tras un descarte, vuelve a vigilar cuando la presión se normaliza
    this.mediciones.push({ t: this.t, nodo: d.nodo, presion: p, caudal: n.caudal, nivel: n.nivel, fuera, origen: d.origen || "simulador" });
    if (this.mediciones.length > 5000) this.mediciones.shift();
    let alerta = null;
    if (fuera) {
      const ult = this.mediciones.filter(m => m.nodo === d.nodo).slice(-CFG.MUESTRAS_CONSECUTIVAS);
      const persistente = ult.length === CFG.MUESTRAS_CONSECUTIVAS && ult.every(m => m.fuera);
      const s = CFG.NODOS[d.nodo][0];
      const abierta = this.incidencias.find(i => i.nodo === d.nodo && i.origen !== "ciudadana" && i.tipo !== "comunicacion" && ["probable", "confirmado", "en_atencion"].includes(i.estado));
      if (persistente && !abierta && !n.silenciado) {
        const tipo = p < CFG.P_MIN ? "baja_presion" : "presion_alta";
        const inc = this._nuevaIncidencia({ sector: s, tipo, origen: "sensor", nodo: d.nodo, estado: "probable" });
        alerta = this._nuevaAlerta(inc, "sensor", "Sensor " + d.nodo + " (" + CFG.NOMBRE_NODO[d.nodo] + "): " + p.toFixed(1).replace(".", ",") + " m.c.a., fuera del rango 32–48 en " + CFG.MUESTRAS_CONSECUTIVAS + " lecturas seguidas");
      }
    }
    this.registrar("medicion", { nodo: d.nodo, presion: p, fuera });
    this._emitir("medicion", { nodo: d.nodo, presion: p, fuera });
    return { ok: true, fuera, alerta: alerta && alerta.id };
  };

  // ---- Avance del reloj simulado: un minuto por paso ----
  M.paso = function () {
    this.t += CFG.MUESTREO_S;
    for (let n = 1; n <= 5; n++) {
      const nodo = this.nodos[n];
      if (nodo.sinSenalForzada) {
        const ult = nodo.ultimaTs == null ? this.t - CFG.MUESTREO_S : nodo.ultimaTs;
        const perdidas = Math.floor((this.t - ult) / CFG.MUESTREO_S);
        nodo.sinSenal = true;
        if (perdidas >= CFG.SIN_SENAL_MUESTRAS && !nodo.alertaSenal) {
          nodo.alertaSenal = true;
          const inc = this._nuevaIncidencia({ sector: CFG.NODOS[n][0], tipo: "comunicacion", origen: "sensor", nodo: n, estado: "probable" });
          this._nuevaAlerta(inc, "comunicacion", "Sensor " + n + " (" + CFG.NOMBRE_NODO[n] + ") sin datos desde las " + hora(ult) + " (" + perdidas + " lecturas perdidas)");
        }
        continue;
      }
      this.medir({ nodo: n, presion: this.modeloPresion(n), origen: "simulador" });
    }
    this._emitir("paso", { t: this.t });
  };

  // ---- Bloque 1B: reporte ciudadano ----
  M.reportar = function (d) {
    const s = +d.sector;
    if (!s || s < 1 || s > CFG.SECTORES) return { ok: false, motivo: "Escoja su sector" };
    if (!TIPOS[d.tipo]) return { ok: false, motivo: "Escoja qué está pasando" };
    // Agrupación: mismo sector y tipo, abierto y de las últimas 2 h (mejora de la iteración tras la prueba E3)
    let inc = this.incidencias.find(i => i.origen !== "sensor" && i.sector === s && i.tipo === d.tipo &&
      ["recibido", "probable", "confirmado", "en_atencion"].includes(i.estado) && this.t - i.tCreada <= CFG.VENTANA_DUP);
    const duplicado = !!inc;
    if (!inc) inc = this._nuevaIncidencia({ sector: s, tipo: d.tipo, origen: "ciudadana", estado: "recibido" });
    let codigo;
    do { codigo = "AQ-" + String(inc.id).padStart(3, "0") + "-" + String(Math.floor(this.r() * 900000) + 100000); } while (this.reportes.some(r => r.codigo === codigo));
    this.reportes.push({ codigo, inc: inc.id, sector: s, tipo: d.tipo, canal: d.canal || "web", t: this.t });
    inc.nReportes++;
    this.registrar("reporte", { codigo, incidencia: inc.id, sector: s, canal: d.canal || "web", duplicado });
    const recientes = this.reportes.filter(r => r.inc === inc.id && this.t - r.t <= CFG.VENTANA_K).length;
    if (inc.estado === "recibido" && recientes >= CFG.K_REPORTES) {
      const nodo = nodoDeSector(s);
      const ult = this.mediciones.filter(m => m.nodo === nodo).slice(-1)[0];
      inc.origen = ult && ult.fuera ? "correlacionada" : "ciudadana";
      inc.estado = "probable"; inc.tProbable = this.t;
      this._nuevaAlerta(inc, inc.origen, recientes + " vecinos del sector " + s + " avisaron «" + TIPOS[d.tipo] + "» en menos de 30 minutos");
    }
    this._emitir("reporte", { codigo });
    return { ok: true, codigo, incidencia: inc.id, duplicado, estado: inc.estado, nReportes: inc.nReportes };
  };

  M._nuevaIncidencia = function (o) {
    const inc = Object.assign({ id: ++this.seq.inc, nReportes: 0, tCreada: this.t, tProbable: this.t, sigoSinAgua: 0, acciones: [] }, o);
    this.incidencias.push(inc);
    return inc;
  };
  M._nuevaAlerta = function (inc, origen, detalle) {
    inc.prioridad = this.prioridad(inc);
    const a = { id: ++this.seq.al, inc: inc.id, origen, detalle, t: this.t, estado: "pendiente", sector: inc.sector, prioridad: inc.prioridad };
    this.alertas.push(a);
    this.registrar("alerta", { alerta: a.id, incidencia: inc.id, origen, detalle });
    this._emitir("alerta", a);
    return a;
  };

  // IP = 0,5·A + 0,3·D + 0,2·V (Etapa 3)
  M.prioridad = function (inc) {
    const A = inc.origen === "ciudadana" ? Math.min(1, inc.nReportes / 10) : 1;
    const D = Math.min(1, (this.t - inc.tCreada) / 86400);
    const V = CFG.SECTORES_PRIORITARIOS.includes(inc.sector) ? 1 : 0;
    return Math.round((0.5 * A + 0.3 * D + 0.2 * V) * 1000) / 1000;
  };

  // ---- Bloque 5A: decisión humana ----
  M.decidir = function (alertaId, decision, operador) {
    const t0 = (global.performance || Date).now();
    const a = this.alertas.find(x => x.id === alertaId);
    if (!a || a.estado !== "pendiente") return { ok: false, motivo: "La alerta no existe o ya fue decidida" };
    const inc = this.incidencias.find(i => i.id === a.inc);
    operador = operador || "Operador de turno";
    if (decision === "descartar") {
      a.estado = "descartada"; inc.estado = "descartada";
      this.registrar("descarte", { alerta: a.id, incidencia: inc.id, operador });
      if (inc.nodo && inc.tipo !== "comunicacion") this.nodos[inc.nodo].silenciado = true; // no repetir hasta que se normalice
      this._emitir("decision", a);
      return { ok: true, estado: "descartada", notificados: 0 };
    }
    if (decision !== "confirmar") return { ok: false, motivo: "Decisión no válida" };
    a.estado = "confirmada"; inc.estado = "confirmado"; inc.tDecision = this.t;
    this.registrar("confirmacion", { alerta: a.id, incidencia: inc.id, operador });
    this.ordenes.push({ inc: inc.id, cuadrilla: "Cuadrilla 1", estado: "asignada", t: this.t });
    this.registrar("orden_trabajo", { incidencia: inc.id, cuadrilla: "Cuadrilla 1" });
    // Bloque 6: publicación y notificación al sector (los 100 usuarios registrados)
    let sms = 0;
    for (let u = 0; u < CFG.USUARIOS_POR_SECTOR; u++) if (u < CFG.USUARIOS_POR_SECTOR * CFG.FRACCION_SMS) sms++;
    this.notificaciones += CFG.USUARIOS_POR_SECTOR; this.notificacionesSMS += sms;
    const ms = (global.performance || Date).now() - t0;
    this.tiemposPublicacion.push(ms);
    inc.publicada = true;
    this.registrar("publicacion", { incidencia: inc.id, notificados: CFG.USUARIOS_POR_SECTOR, sms });
    this._emitir("decision", a);
    return { ok: true, estado: "confirmado", notificados: CFG.USUARIOS_POR_SECTOR, sms, ms };
  };

  // ---- Bloque 5B: mantenimiento ----
  const SIG = { confirmado: "en_atencion", en_atencion: "solucionado", solucionado: "cerrado" };
  M.avanzar = function (incId, accion) {
    const inc = this.incidencias.find(i => i.id === incId);
    if (!inc || !SIG[inc.estado]) return { ok: false, motivo: "El caso no puede avanzar desde su estado actual" };
    const nuevo = SIG[inc.estado];
    if (nuevo === "solucionado" && !(accion && accion.trim())) return { ok: false, motivo: "Para marcar como solucionado hay que escribir qué se hizo" };
    const de = inc.estado; inc.estado = nuevo;
    if (accion) inc.acciones.push({ t: this.t, accion });
    if (nuevo === "solucionado" && inc.tipo === "comunicacion") { this.nodos[inc.nodo].sinSenalForzada = false; this.nodos[inc.nodo].alertaSenal = false; }
    if (nuevo === "solucionado" && inc.nodo && inc.tipo !== "comunicacion") { this.nodos[inc.nodo].fuga = null; this.nodos[inc.nodo].desfase = 0; }
    this.registrar("cambio_estado", { incidencia: incId, de, a: nuevo, accion: accion || "" });
    this._emitir("estado", inc);
    return { ok: true, estado: nuevo };
  };

  // ---- Retroalimentación ciudadana ----
  M.sigoSinAgua = function (codigo) {
    const r = this.reportes.find(x => x.codigo === codigo);
    if (!r) return { ok: false, motivo: "Código no encontrado" };
    const inc = this.incidencias.find(i => i.id === r.inc);
    if (inc.estado !== "solucionado") return { ok: false, motivo: "Solo se puede responder cuando el caso figura como solucionado" };
    inc.sigoSinAgua++;
    let estado = "solucionado";
    if (inc.sigoSinAgua >= CFG.K_REPORTES) { inc.estado = "en_atencion"; inc.sigoSinAgua = 0; estado = "en_atencion"; }
    this.registrar("retroalimentacion", { incidencia: inc.id, estado });
    this._emitir("estado", inc);
    return { ok: true, estado };
  };

  M.consultar = function (codigo) {
    const r = this.reportes.find(x => x.codigo === (codigo || "").trim().toUpperCase());
    if (!r) return { ok: false, motivo: "No encontramos ese código. Revise que esté bien escrito." };
    const inc = this.incidencias.find(i => i.id === r.inc);
    return { ok: true, sector: r.sector, tipo: r.tipo, estado: inc.estado, nReportes: inc.nReportes };
  };

  // ---- Bloque 6: información pública (sin datos personales) ----
  // Público: solo lo confirmado por una persona. Interno (operador): también lo que está en revisión.
  M.estadoPublico = function (interno) {
    const sectores = {};
    for (let s = 1; s <= CFG.SECTORES; s++) sectores[s] = "normal";
    const peso = interno ? { probable: 1, confirmado: 2, en_atencion: 3 } : { confirmado: 2, en_atencion: 3 };
    this.incidencias.forEach(i => {
      if (!peso[i.estado] || i.tipo === "comunicacion") return;
      const actual = sectores[i.sector];
      if (actual === "normal" || peso[i.estado] > (peso[actual] || 0)) sectores[i.sector] = i.estado;
    });
    return { sectores };
  };

  M.cerrarPendientes = function () { // utilidad del escenario «todo normal»
    for (let n = 1; n <= 5; n++) { const x = this.nodos[n]; x.fuga = null; x.desfase = 0; x.sinSenalForzada = false; }
  };

  function hora(t) {
    const h = Math.floor(t / 3600) % 24, m = Math.floor(t / 60) % 60;
    const ap = h < 12 ? "a. m." : "p. m.";
    return ((h % 12) || 12) + ":" + String(m).padStart(2, "0") + " " + ap;
  }

  global.AquaSens = { Motor, CFG, TIPOS, hora, sha256 };
})(window);
