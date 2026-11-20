(function () {
  "use strict";
  const { Motor, CFG, TIPOS, hora } = window.AquaSens;
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const num = (x, d = 1) => (Math.round(x * Math.pow(10, d)) / Math.pow(10, d)).toLocaleString("es-CO", { minimumFractionDigits: d, maximumFractionDigits: d });
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const motor = new Motor({ inicio: 6 * 3600 });
  for (let i = 0; i < 40; i++) motor.paso(); // 40 minutos simulados de historia para las gráficas

  let pausado = false, rapido = false, temporizador = null, nodoSel = 1, tipoSel = "interrupcion", regActual = "lecturas";
  let ultimaBateria = null;
  const registroEsc = [], vigilantes = [];

  // ---------------- utilidades de interfaz ----------------
  function aviso(txt) {
    const t = $("#toast"); t.textContent = txt; t.classList.add("ver");
    clearTimeout(aviso._t); aviso._t = setTimeout(() => t.classList.remove("ver"), 3200);
  }
  function poner(el, html) { if (el._html !== html) { el.innerHTML = html; el._html = html; } }
  function msg(el, html, err) { el.innerHTML = '<div class="msg ' + (err ? "err" : "") + '">' + html + "</div>"; }
  function descargar(nombre, filas) {
    const csv = "﻿" + filas.map(f => f.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(";")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = nombre; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    aviso("Se descargó " + nombre);
  }

  // ---------------- reloj ----------------
  function iniciarReloj() {
    clearInterval(temporizador);
    if (!pausado) temporizador = setInterval(() => { motor.paso(); revisarVigilantes(); pintar(); }, rapido ? 400 : 2000);
    $("#pulso").classList.toggle("parado", pausado);
    $("#btnPausa").textContent = pausado ? "▶ Continuar" : "⏸ Pausar";
    $("#btnPausa").setAttribute("aria-pressed", String(pausado));
    $("#btnVel").textContent = rapido ? "×5" : "×1";
  }
  $("#btnPausa").onclick = () => { pausado = !pausado; iniciarReloj(); };
  $("#btnVel").onclick = () => { rapido = !rapido; iniciarReloj(); aviso(rapido ? "Simulación rápida: 1 minuto cada 0,4 s" : "Simulación normal: 1 minuto cada 2 s"); };

  // ---------------- pestañas ----------------
  function irA(v) {
    $$(".pestanas button").forEach(b => b.classList.toggle("activa", b.dataset.vista === v));
    $$(".vista").forEach(s => s.classList.toggle("activa", s.id === "v-" + v));
    try { history.replaceState(null, "", "#" + v); } catch (e) { /* sin historial */ }
    pintar();
  }
  $$(".pestanas button").forEach(b => b.onclick = () => { irA(b.dataset.vista); window.scrollTo({ top: 0, behavior: "smooth" }); });

  // ================= VECINOS =================
  const ESTADO_SECTOR = { normal: ["✅", "Sin daños confirmados"], confirmado: ["⚠️", "Daño confirmado"], en_atencion: ["🔧", "Cuadrilla trabajando"] };
  const ESTADO_CIUDADANO = {
    recibido: "Recibimos su aviso. Estamos esperando más avisos del sector para revisarlo.",
    probable: "El acueducto está revisando el problema.",
    confirmado: "El daño está confirmado y se avisó a todo el sector. La cuadrilla va en camino.",
    en_atencion: "La cuadrilla está trabajando en el daño.",
    solucionado: "El acueducto dice que ya está arreglado. ¿Ya le llegó el agua?",
    cerrado: "Caso cerrado. Gracias por avisar.",
    descartada: "El acueducto revisó y no encontró un daño en la red. Si sigue sin agua, vuelva a avisar."
  };
  for (let s = 1; s <= CFG.SECTORES; s++) $("#selSector").add(new Option("Sector " + s, s));
  $$(".opcion").forEach(b => b.onclick = () => {
    tipoSel = b.dataset.tipo;
    $$(".opcion").forEach(x => { x.classList.toggle("sel", x === b); x.setAttribute("aria-checked", String(x === b)); });
  });
  $("#btnAvisar").onclick = () => {
    const r = motor.reportar({ sector: +$("#selSector").value, tipo: tipoSel, canal: "web" });
    if (!r.ok) return msg($("#resAviso"), esc(r.motivo), true);
    $("#txtCodigo").value = r.codigo;
    msg($("#resAviso"), "¡Aviso recibido! Su código es<br><span class='codigo'>" + r.codigo + "</span><br>" +
      esc(ESTADO_CIUDADANO[r.estado]) + (r.duplicado ? "<br>Ya había " + (r.nReportes - 1) + " aviso(s) de sus vecinos; el suyo se sumó." : ""));
    revisarVigilantes(); pintar();
  };
  $("#btnConsultar").onclick = () => {
    const c = $("#txtCodigo").value;
    const r = motor.consultar(c);
    const el = $("#resConsulta");
    if (!r.ok) return msg(el, esc(r.motivo), true);
    let html = "<b>Sector " + r.sector + " · " + TIPOS[r.tipo] + "</b><br>" + esc(ESTADO_CIUDADANO[r.estado]) + "<br>Avisos de este problema: " + r.nReportes + ".";
    if (r.estado === "solucionado") html += "<div class='fila-btn'><button class='btn-chico' id='btnSigo' type='button'>Todavía no tengo agua</button></div>";
    msg(el, html);
    const b = $("#btnSigo");
    if (b) b.onclick = () => { const s = motor.sigoSinAgua(c.trim().toUpperCase()); aviso(s.ok ? (s.estado === "en_atencion" ? "Con su respuesta el caso se reabrió." : "Gracias. Si 3 vecinos dicen lo mismo, el caso se reabre.") : s.motivo); pintar(); $("#btnConsultar").click(); };
  };

  function pintarVecinos() {
    const sec = motor.estadoPublico().sectores;
    poner($("#sectores"), Object.keys(sec).map(s => {
      const [ic, txt] = ESTADO_SECTOR[sec[s]];
      return "<button type='button' class='sector " + sec[s] + "' data-s='" + s + "' aria-label='Sector " + s + ": " + txt + "'><b>Sector " + s + "</b><span>" + ic + " " + txt + "</span></button>";
    }).join(""));
  }
  $("#sectores").addEventListener("click", e => { const b = e.target.closest(".sector"); if (!b) return; $("#selSector").value = b.dataset.s; $("#t-avisar").scrollIntoView({ behavior: "smooth", block: "start" }); });

  // ================= OPERADOR =================
  const ORIGEN = { ciudadana: "Avisos de vecinos", sensor: "Sensor de presión", correlacionada: "Sensor y vecinos", comunicacion: "Sensor sin señal" };
  const ESTADO_CASO = { confirmado: ["c-mal", "Confirmado"], en_atencion: ["c-aviso", "En atención"], solucionado: ["c-ok", "Solucionado"] };
  const NOMBRE_TIPO = Object.assign({ presion_alta: "Presión muy alta", comunicacion: "Sensor sin señal" }, TIPOS);

  function pintarOperador() {
    const pend = motor.alertas.filter(a => a.estado === "pendiente");
    poner($("#kpisOp"),
      "<div class='kpi'><b>" + motor.recibidas.toLocaleString("es-CO") + "</b><span>Lecturas recibidas</span></div>" +
      "<div class='kpi'><b>" + motor.rechazadas.length + "</b><span>Lecturas rechazadas por imposibles</span></div>" +
      "<div class='kpi'><b>" + pend.length + "</b><span>Alertas por revisar</span></div>" +
      "<div class='kpi'><b>" + motor.notificaciones.toLocaleString("es-CO") + "</b><span>Mensajes a vecinos (" + motor.notificacionesSMS + " SMS)</span></div>");

    poner($("#alertas"), pend.sort((a, b) => b.prioridad - a.prioridad || a.t - b.t).map(a => {
      const nivel = a.prioridad >= 0.7 ? ["c-mal", "alta"] : a.prioridad >= 0.4 ? ["c-aviso", "media"] : ["c-info", "baja"];
      return "<div class='alerta " + (a.prioridad >= 0.7 ? "alta " : "") + (a.origen === "comunicacion" ? "senal" : "") + "'><div class='fila'><b>Alerta #" + a.id + " · Sector " + a.sector + "</b>" +
        "<span class='chip " + nivel[0] + "'>Prioridad " + nivel[1] + " · IP " + num(a.prioridad, 2) + "</span></div><div>" + esc(a.detalle) + "</div>" +
        "<div class='fila'><span class='datos'>" + ORIGEN[a.origen] + " · " + hora(a.t) + "</span><div class='acciones'>" +
        "<button class='b-conf' data-al='" + a.id + "' data-d='confirmar'>Confirmar</button><button class='b-desc' data-al='" + a.id + "' data-d='descartar'>Descartar</button></div></div></div>";
    }).join("") || "<div class='vacio'>No hay alertas por revisar ✔</div>");

    const casos = motor.incidencias.filter(i => ESTADO_CASO[i.estado]).sort((a, b) => b.id - a.id);
    const escribiendo = $("#casos").contains(document.activeElement);
    if (!escribiendo) poner($("#casos"), casos.map(i => {
      const [cls, txt] = ESTADO_CASO[i.estado];
      let acc = "";
      if (i.estado === "confirmado") acc = "<button class='b-av' data-c='" + i.id + "'>Iniciar atención</button>";
      if (i.estado === "en_atencion") acc = "<input class='accion-txt' id='acc" + i.id + "' placeholder='¿Qué se hizo? (obligatorio)'><button class='b-av' data-c='" + i.id + "'>Marcar solucionado</button>";
      if (i.estado === "solucionado") acc = "<button class='b-av' data-c='" + i.id + "'>Cerrar caso</button>";
      const hecho = i.acciones.length ? "<div class='datos'>Acción registrada: " + esc(i.acciones[i.acciones.length - 1].accion) + "</div>" : "";
      const nombre = i.origen === "ciudadana" ? NOMBRE_TIPO[i.tipo] : ({ baja_presion: "Presión baja (posible fuga)", presion_alta: "Presión muy alta", comunicacion: "Sensor sin señal" }[i.tipo] || NOMBRE_TIPO[i.tipo]) + (i.nodo ? " · sensor " + i.nodo : "");
      return "<div class='alerta'><div class='fila'><b>Caso #" + i.id + " · Sector " + i.sector + " · " + nombre + "</b><span class='chip " + cls + "'>" + txt + "</span></div>" + hecho + "<div class='acciones'>" + acc + "</div></div>";
    }).join("") || "<div class='vacio'>No hay daños en atención</div>");

    poner($("#nodos"), [1, 2, 3, 4, 5].map(n => {
      const x = motor.nodos[n];
      const pos = v => Math.max(0, Math.min(100, v / 60 * 100));
      const sel = n === nodoSel ? " sel" : "";
      if (x.sinSenal) {
        const hace = x.ultimaTs == null ? "—" : Math.round((motor.t - x.ultimaTs) / 60);
        return "<button class='nodo sin" + sel + "' data-n='" + n + "'><div class='id'>S" + n + "</div><div><b>" + CFG.NOMBRE_NODO[n] + "</b><div class='datos'>Sin datos hace " + hace + " min. Último dato: " + num(x.presion) + " m.c.a. a las " + hora(x.ultimaTs) + " (no es actual)</div></div><span class='chip c-gris'>📡 Sin señal</span></button>";
      }
      const fuera = x.presion < CFG.P_MIN || x.presion > CFG.P_MAX;
      return "<button class='nodo" + sel + "' data-n='" + n + "'><div class='id'>S" + n + "</div><div><b>" + CFG.NOMBRE_NODO[n] + "</b>" +
        "<div class='barra-p'><div class='banda' style='left:" + pos(CFG.P_MIN) + "%;width:" + (pos(CFG.P_MAX) - pos(CFG.P_MIN)) + "%'></div><div class='punto " + (fuera ? "mal" : "") + "' style='left:" + pos(x.presion) + "%'></div></div>" +
        "<div class='datos'><b style='color:var(--tinta)'>" + num(x.presion) + " m.c.a.</b> · " + num(x.caudal) + " L/min · tanque " + num(x.nivel) + " %</div></div>" +
        "<span class='chip " + (fuera ? "c-mal" : "c-ok") + "'>" + (fuera ? (x.presion < CFG.P_MIN ? "⬇ Muy baja" : "⬆ Muy alta") : "Normal") + "</span></button>";
    }).join(""));

    pintarGrafica();
    const sec = motor.estadoPublico(true).sectores;
    poner($("#miniMapa"), Object.keys(sec).map(s => "<div class='" + sec[s] + "'>S" + s + "</div>").join(""));
  }

  $("#alertas").addEventListener("click", e => {
    const b = e.target.closest("button[data-al]"); if (!b) return;
    const r = motor.decidir(+b.dataset.al, b.dataset.d, "Operador de turno");
    aviso(r.ok ? (r.estado === "descartada" ? "Alerta descartada: no se avisó a nadie." : "Confirmada: se avisó a " + r.notificados + " vecinos (" + r.sms + " por SMS) en " + num(r.ms, 1) + " ms.") : r.motivo);
    revisarVigilantes(); pintar();
  });
  $("#casos").addEventListener("click", e => {
    const b = e.target.closest("button[data-c]"); if (!b) return;
    const id = +b.dataset.c, campo = $("#acc" + id);
    const r = motor.avanzar(id, campo ? campo.value : "");
    aviso(r.ok ? "Caso #" + id + ": " + ({ en_atencion: "en atención", solucionado: "solucionado", cerrado: "cerrado" }[r.estado]) : r.motivo);
    $("#casos")._html = null; b.blur(); pintar();
  });
  $("#nodos").addEventListener("click", e => { const b = e.target.closest(".nodo"); if (!b) return; nodoSel = +b.dataset.n; pintar(); });

  function pintarGrafica() {
    const datos = motor.mediciones.filter(m => m.nodo === nodoSel).slice(-60);
    $("#tituloGraf").textContent = "Presión del sensor " + nodoSel + " (" + CFG.NOMBRE_NODO[nodoSel] + ") · última hora";
    const W = 600, H = 220, padL = 34, padB = 22, ymin = 15, ymax = 60;
    if (!datos.length) { $("#grafica").innerHTML = "<div class='vacio'>Sin datos</div>"; return; }
    const t1 = motor.t, t0 = t1 - 59 * 60;
    const X = t => padL + (t - t0) / (t1 - t0 || 1) * (W - padL - 8);
    const Y = v => 8 + (1 - (Math.max(ymin, Math.min(ymax, v)) - ymin) / (ymax - ymin)) * (H - padB - 8);
    let tramos = [], actual = [];
    datos.forEach((d, i) => { if (i && d.t - datos[i - 1].t > 90) { tramos.push(actual); actual = []; } actual.push(d); });
    tramos.push(actual);
    const lineas = tramos.map(tr => "<polyline fill='none' stroke='#0d6e8a' stroke-width='2.5' points='" + tr.map(d => X(d.t).toFixed(1) + "," + Y(d.presion).toFixed(1)).join(" ") + "'/>").join("");
    const puntos = datos.map(d => "<circle cx='" + X(d.t).toFixed(1) + "' cy='" + Y(d.presion).toFixed(1) + "' r='" + (d.fuera ? 4 : 2.5) + "' fill='" + (d.fuera ? "#9b2c2c" : "#0d6e8a") + "'/>").join("");
    const ejes = [20, 32, 40, 48, 60].map(v => "<text x='4' y='" + (Y(v) + 4) + "' font-size='11' fill='#4a5668'>" + v + "</text><line x1='" + padL + "' x2='" + (W - 8) + "' y1='" + Y(v) + "' y2='" + Y(v) + "' stroke='#e4ddd3'/>").join("");
    const horas = [t0, t0 + 30 * 60, t1].map((t, i) => "<text x='" + (i === 0 ? padL : i === 2 ? W - 60 : X(t) - 25) + "' y='" + (H - 4) + "' font-size='11' fill='#4a5668'>" + hora(t) + "</text>").join("");
    $("#grafica").innerHTML = "<svg viewBox='0 0 " + W + " " + H + "' preserveAspectRatio='none'><rect x='" + padL + "' y='" + Y(48) + "' width='" + (W - padL - 8) + "' height='" + (Y(32) - Y(48)) + "' fill='#dcefe4'/>" + ejes + lineas + puntos + horas + "</svg>";
    const fueras = datos.filter(d => d.fuera).length;
    const huecos = 60 - datos.filter(d => d.t >= t0).length;
    $("#pieGraf").textContent = datos.length + " lecturas en la última hora; " + fueras + " fuera del rango normal" + (huecos > 0 ? "; " + huecos + " minutos sin datos" : "") + ". Franja verde: 32 a 48 m.c.a.";
  }

  $("#btnVerificar").onclick = () => { verificar(); aviso($("#estadoBitacora").textContent); };
  function verificar() {
    const v = motor.verificarBitacora();
    const e = $("#estadoBitacora");
    e.className = "chip " + (v.integra ? "c-ok" : "c-mal");
    e.textContent = v.integra ? "🔒 Bitácora íntegra (" + v.revisados.toLocaleString("es-CO") + " eventos)" : "⚠ Bitácora alterada en el evento " + v.fallaEn;
    return v;
  }

  // ================= PRUEBAS =================
  for (let n = 1; n <= 5; n++) $("#manNodo").add(new Option("Sensor " + n + " · " + CFG.NOMBRE_NODO[n], n));
  $("#btnManual").onclick = () => {
    const n = +$("#manNodo").value, v = $("#manPresion").value;
    const r = motor.medir({ nodo: n, presion: v === "" ? "" : +v, origen: "manual" });
    if (!r.ok) msg($("#resManual"), "Lectura rechazada: " + esc(r.motivo), true);
    else msg($("#resManual"), "Lectura guardada en el sensor " + n + ": " + num(+v) + " m.c.a. → " + (r.fuera ? "fuera del rango normal" + (r.alerta ? " y se generó la alerta #" + r.alerta : " (falta otra lectura seguida para alertar)") : "normal") + ".");
    pintar();
  };

  function agregarRegistro(escenario, esperado) {
    const fila = { t: motor.t, escenario, esperado, obtenido: "Esperando…", estado: "espera" };
    registroEsc.unshift(fila); return fila;
  }
  function vigilar(fila, limiteMin, comprobar) { vigilantes.push({ fila, limite: motor.t + limiteMin * 60, comprobar, t0: motor.t }); revisarVigilantes(); }
  function revisarVigilantes() {
    for (let i = vigilantes.length - 1; i >= 0; i--) {
      const v = vigilantes[i];
      const r = v.comprobar(v);
      if (r) { v.fila.obtenido = r; v.fila.estado = "ok"; vigilantes.splice(i, 1); }
      else if (motor.t > v.limite) { v.fila.obtenido = "No ocurrió en " + Math.round((v.limite - v.t0) / 60) + " minutos simulados"; v.fila.estado = "no"; vigilantes.splice(i, 1); }
    }
  }
  function alertaNodo(n, origen, desde) {
    const nueva = motor.alertas.find(a => a.t >= desde && a.origen === origen && (motor.incidencias.find(i => i.id === a.inc) || {}).nodo === n);
    if (nueva) return nueva;
    // Si el sensor ya tenía un caso abierto, el sistema no duplica la alerta: eso también es el comportamiento correcto
    const abierta = motor.incidencias.find(i => i.nodo === n && i.tCreada < desde && ["probable", "confirmado", "en_atencion"].includes(i.estado) && (origen === "comunicacion" ? i.tipo === "comunicacion" : i.tipo !== "comunicacion"));
    if (abierta) { const a = motor.alertas.find(x => x.inc === abierta.id); return { id: a.id, t: desde, detalle: ": ya había un caso abierto (#" + abierta.id + ") para este sensor; no se duplicó la alerta", previa: true }; }
    return null;
  }

  const ESCENARIOS = {
    normal() {
      motor.cerrarPendientes();
      const f = agregarRegistro("Todo normal", "Los 5 sensores vuelven a enviar datos dentro de 32–48 m.c.a.");
      vigilar(f, 8, () => {
        const ok = [1, 2, 3, 4, 5].every(n => { const x = motor.nodos[n]; return !x.sinSenal && x.ultimaTs === motor.t && x.presion >= CFG.P_MIN && x.presion <= CFG.P_MAX; });
        return ok ? "Los 5 sensores reportan en rango a las " + hora(motor.t) : null;
      });
    },
    fuga() {
      motor.nodos[3].fuga = motor.t; motor.nodos[3].sinSenalForzada = false;
      const f = agregarRegistro("Fuga en el sensor 3", "Alerta de presión baja en 4 minutos o menos");
      vigilar(f, 8, v => { const a = alertaNodo(3, "sensor", v.t0); return a ? "Alerta #" + a.id + " a los " + Math.round((a.t - v.t0) / 60) + " min: " + a.detalle.split(": ")[1] : null; });
    },
    alta() {
      motor.nodos[2].desfase = 12; motor.nodos[2].sinSenalForzada = false;
      const f = agregarRegistro("Presión muy alta en el sensor 2", "Alerta de presión alta en 3 minutos o menos");
      vigilar(f, 6, v => { const a = alertaNodo(2, "sensor", v.t0); return a ? "Alerta #" + a.id + " a los " + Math.round((a.t - v.t0) / 60) + " min: " + a.detalle.split(": ")[1] : null; });
    },
    senal() {
      motor.nodos[5].sinSenalForzada = true;
      const f = agregarRegistro("Se cae la señal del sensor 5", "Marca «Sin señal» y alerta a los 3 minutos sin datos");
      vigilar(f, 6, v => { const a = alertaNodo(5, "comunicacion", v.t0); return a ? "Alerta #" + a.id + " a los " + Math.round((a.t - v.t0) / 60) + " min; el sensor muestra «Sin señal» y su último dato como no actual" : null; });
    },
    imposible() {
      const r = motor.medir({ nodo: 4, presion: -5, origen: "escenario" });
      const f = agregarRegistro("Lectura imposible (−5 m.c.a.)", "Se rechaza y no se guarda como lectura");
      f.obtenido = r.ok ? "Se guardó (error)" : "Rechazada: " + r.motivo; f.estado = r.ok ? "no" : "ok";
    },
    vecinos() {
      const antes = motor.alertas.length;
      let r; for (let i = 0; i < 3; i++) r = motor.reportar({ sector: 7, tipo: "interrupcion", canal: i === 1 ? "linea" : "web" });
      const inc = motor.incidencias.find(x => x.id === r.incidencia);
      const f = agregarRegistro("3 vecinos sin agua (sector 7)", "El caso pasa a revisión del operador (alerta nueva o se suma a la abierta)");
      const nueva = motor.alertas.length > antes;
      const ok = ["probable", "confirmado", "en_atencion"].includes(inc.estado);
      f.obtenido = "Caso #" + inc.id + " con " + inc.nReportes + " avisos, estado «" + inc.estado + "»" + (nueva ? "; alerta #" + motor.alertas[motor.alertas.length - 1].id + " creada" : "; se sumó al caso abierto");
      f.estado = ok ? "ok" : "no";
    },
    repetidos() {
      const ids = new Set(); for (let i = 0; i < 5; i++) ids.add(motor.reportar({ sector: 2, tipo: "fuga" }).incidencia);
      const f = agregarRegistro("5 avisos repetidos (sector 2)", "Los 5 avisos quedan en un solo caso");
      const inc = motor.incidencias.find(x => x.id === [...ids][0]);
      f.obtenido = ids.size === 1 ? "1 caso (#" + inc.id + ") con " + inc.nReportes + " avisos" : ids.size + " casos distintos";
      f.estado = ids.size === 1 ? "ok" : "no";
    }
  };
  $$(".esc").forEach(b => b.onclick = () => { ESCENARIOS[b.dataset.esc](); aviso("Escenario aplicado. Véalo en la pestaña Operador."); pintar(); });

  function pintarPruebas() {
    poner($("#regEsc"), registroEsc.map(f => "<tr><td>" + hora(f.t) + "</td><td><b>" + esc(f.escenario) + "</b></td><td>" + esc(f.esperado) + "</td><td>" + esc(f.obtenido) + "</td><td><span class='chip " +
      (f.estado === "ok" ? "c-ok'>✔ Cumple" : f.estado === "no" ? "c-mal'>✖ No cumple" : "c-aviso'>⏳ En curso") + "</span></td></tr>").join("") ||
      "<tr><td colspan='5' class='vacio'>Todavía no ha corrido ningún escenario.</td></tr>");
  }

  $("#btnBateria").onclick = () => {
    const res = window.PruebasAquaSens.ejecutar();
    ultimaBateria = { res, cuando: new Date() };
    const ok = res.filter(r => r.ok).length;
    $("#resumenBateria").innerHTML = "<div class='resumen'><span class='chip " + (ok === res.length ? "c-ok" : "c-mal") + "'>" + ok + " de " + res.length + " pruebas cumplen</span><span class='chip c-info'>Ejecutadas el " + ultimaBateria.cuando.toLocaleString("es-CO") + "</span><span class='chip c-info'>Tiempo total " + num(res.reduce((s, r) => s + r.ms, 0), 1) + " ms</span></div>";
    $("#tablaBateria").innerHTML = res.map(r => "<tr><td><b>" + r.cod + "</b></td><td>" + esc(r.nombre) + "</td><td>" + esc(r.esperado) + "</td><td>" + esc(r.obtenido) + "</td><td><span class='chip " + (r.ok ? "c-ok'>✔ Cumple" : "c-mal'>✖ No cumple") + "</span></td></tr>").join("");
    $("#btnCsvPruebas").disabled = false;
    pintar();
  };
  $("#btnCsvPruebas").onclick = () => {
    if (!ultimaBateria) return;
    descargar("pruebas_aquasens.csv", [["Código", "Prueba", "Resultado esperado", "Resultado obtenido", "Estado", "Tiempo (ms)", "Fecha"]]
      .concat(ultimaBateria.res.map(r => [r.cod, r.nombre, r.esperado, r.obtenido, r.ok ? "Cumple" : "No cumple", num(r.ms, 2), ultimaBateria.cuando.toLocaleString("es-CO")])));
  };

  // ================= RESULTADOS =================
  let pesoPagina = null;
  (async function medirPeso() {
    try {
      let total = 0;
      for (const f of ["index.html", "estilos.css", "motor.js", "datos_lab.js", "pruebas.js", "app.js"]) {
        const r = await fetch(f, { cache: "no-store" }); total += (await r.arrayBuffer()).byteLength;
      }
      pesoPagina = total / 1000; pintar();
    } catch (e) { pesoPagina = null; }
  })();

  function cumplimiento(f) {
    const menor = f.op === "<=";
    const cumple = menor ? f.res <= f.meta : f.res >= f.meta;
    const pct = cumple ? 100 : (menor ? (f.meta / f.res) * 100 : (f.res / f.meta) * 100);
    const desv = f.meta === 0 ? 0 : (f.res - f.meta) / f.meta * 100;
    return { cumple, pct, desv };
  }
  function pintarResultados() {
    const filas = (window.DATOS_LAB || []).slice();
    if (pesoPagina != null) filas.splice(3, 0, { ind: "Peso de esta página (medido ahora en su navegador)", meta: 300, op: "<=", u: "KB", res: Math.round(pesoPagina * 10) / 10, fuente: "Medición en vivo" });
    poner($("#tablaKpi"), filas.map(f => {
      const c = cumplimiento(f);
      return "<tr><td>" + esc(f.ind) + "<div class='datos'>" + esc(f.fuente) + "</div></td><td>" + (f.op === "<=" ? "≤ " : "≥ ") + num(f.meta, f.meta % 1 ? 1 : 0) + " " + f.u + "</td><td><b>" + num(f.res, f.res < 10 && f.res % 1 ? 2 : 1) + " " + f.u + "</b></td><td>" + num(c.pct, 1) + " %</td><td>" + (c.desv > 0 ? "+" : "") + num(c.desv, 1) + " %</td><td><span class='chip " + (c.cumple ? "c-ok'>✔ Sí" : "c-mal'>✖ No") + "</span></td></tr>";
    }).join(""));
    poner($("#barrasKpi"), filas.map(f => {
      const c = cumplimiento(f);
      return "<div class='barra-kpi'><span>" + esc(f.ind.split(" · ")[0].replace(/\(.*\)/, "").trim()) + (f.ind.includes(" · ") ? " · " + esc(f.ind.split(" · ")[1]) : "") + "</span><div class='pista'><div class='relleno " + (c.cumple ? "" : "no") + "' style='width:" + Math.min(100, c.pct) + "%'></div></div><b>" + num(c.pct, 0) + " %</b></div>";
    }).join(""));

    const total = motor.recibidas + motor.rechazadas.length;
    const tp = motor.tiemposPublicacion;
    const v = motor.verificarBitacora();
    const sens = window.DATOS_SENSORES || {};
    $("#kpisSesion").innerHTML =
      "<div class='kpi'><b>" + num(total ? motor.recibidas / total * 100 : 100, 1) + " %</b><span>Lecturas válidas (" + motor.recibidas.toLocaleString("es-CO") + " de " + total.toLocaleString("es-CO") + ")</span></div>" +
      "<div class='kpi'><b>" + motor.alertas.length + "</b><span>Alertas generadas (" + motor.alertas.filter(a => a.estado === "confirmada").length + " confirmadas, " + motor.alertas.filter(a => a.estado === "descartada").length + " descartadas)</span></div>" +
      "<div class='kpi'><b>" + (tp.length ? num(tp.reduce((s, x) => s + x, 0) / tp.length, 2) + " ms" : "—") + "</b><span>Tiempo medio para publicar tras confirmar (meta ≤ 5 min)</span></div>" +
      "<div class='kpi'><b>" + (v.integra ? "Íntegra" : "Alterada") + "</b><span>Bitácora: " + v.revisados.toLocaleString("es-CO") + " eventos verificados</span></div>" +
      "<div class='kpi'><b>" + (ultimaBateria ? ultimaBateria.res.filter(r => r.ok).length + "/" + ultimaBateria.res.length : "—") + "</b><span>Pruebas automáticas que cumplen (última ejecución)</span></div>" +
      "<div class='kpi'><b>" + (sens.detectadas || 0) + "/" + (sens.fugas || 0) + "</b><span>Fugas detectadas en el laboratorio (24 h simuladas), retardo medio " + num(sens.retardo_medio_min || 0, 2) + " min, " + (sens.falsas || 0) + " falsas alarmas</span></div>";
    pintarRegistros();
  }

  const REG = {
    lecturas: [["Hora sim.", "Sensor", "Presión (m.c.a.)", "Caudal (L/min)", "Tanque (%)", "Estado", "Origen"], () => motor.mediciones.slice(-120).reverse().map(m => [hora(m.t), "S" + m.nodo, num(m.presion), num(m.caudal), num(m.nivel), m.fuera ? "Fuera de rango" : "Normal", m.origen])],
    rechazos: [["Hora sim.", "Sensor", "Valor recibido", "Motivo", "Origen"], () => motor.rechazadas.slice().reverse().map(r => [hora(r.t), "S" + r.nodo, r.valor === "" ? "(vacío)" : r.valor, r.motivo, r.origen])],
    alertas: [["#", "Hora sim.", "Sector", "Origen", "Detalle", "Prioridad", "Estado"], () => motor.alertas.slice().reverse().map(a => [a.id, hora(a.t), a.sector, ORIGEN[a.origen], a.detalle, num(a.prioridad, 2), a.estado])],
    bitacora: [["#", "Hora sim.", "Evento", "Hash (inicio)"], () => motor.bitacora.slice(-120).reverse().map(b => [b.id, hora(b.t), b.evento, b.hash.slice(0, 16) + "…"])]
  };
  $$(".sub-pest button").forEach(b => b.onclick = () => { regActual = b.dataset.reg; $$(".sub-pest button").forEach(x => x.classList.toggle("activa", x === b)); pintarRegistros(); });
  function pintarRegistros() {
    const [cab, fn] = REG[regActual];
    poner($("#regCab"), "<tr>" + cab.map(c => "<th>" + c + "</th>").join("") + "</tr>");
    const filas = fn();
    poner($("#regCuerpo"), filas.map(f => "<tr>" + f.map(c => "<td>" + esc(c) + "</td>").join("") + "</tr>").join("") || "<tr><td colspan='" + cab.length + "' class='vacio'>Sin registros todavía.</td></tr>");
  }
  $("#btnCsvLecturas").onclick = () => descargar("lecturas_aquasens.csv", [["Hora simulada", "Sensor", "Presión (m.c.a.)", "Caudal (L/min)", "Tanque (%)", "Estado", "Origen"]]
    .concat(motor.mediciones.map(m => [hora(m.t), m.nodo, num(m.presion), num(m.caudal), num(m.nivel), m.fuera ? "Fuera de rango" : "Normal", m.origen])));

  // ================= pintar =================
  let pendiente = false;
  function pintar() {
    if (pendiente) return; pendiente = true;
    requestAnimationFrame(() => {
      pendiente = false;
      $("#hora").textContent = hora(motor.t);
      const vista = ($(".vista.activa") || {}).id;
      if (vista === "v-vecinos") pintarVecinos();
      if (vista === "v-operador") { pintarOperador(); verificar(); }
      if (vista === "v-pruebas") pintarPruebas();
      if (vista === "v-resultados") pintarResultados();
      const pend = motor.alertas.filter(a => a.estado === "pendiente").length;
      const bOp = $(".pestanas [data-vista=operador] span");
      bOp.textContent = pend ? "Operador (" + pend + ")" : "Operador";
      bOp.parentElement.setAttribute("aria-label", pend ? "Operador, " + pend + " alertas por revisar" : "Operador");
    });
  }

  window.addEventListener("hashchange", () => { const h = location.hash.slice(1); if (document.getElementById("v-" + h)) irA(h); });
  const inicial = (location.hash || "").slice(1);
  irA(["vecinos", "operador", "pruebas", "resultados", "como"].includes(inicial) ? inicial : "vecinos");
  iniciarReloj();
  window.__motor = motor; // para revisión desde la consola
})();
