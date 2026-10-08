// URL de tu Google Sheets publicado como CSV (reemplaza con tu link real)
const SHEET_CSV_URL ="https://script.google.com/macros/s/AKfycbyitZZk-9qxOtuIWrkxhPbYoeJ8KRyt0oORXOXFSZ6-yqd1OxTEVDsT5s77vLRo_OWgGA/exec";

const URL_WEB_APP =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vSf7mN6wC1ybMOKz1DXWeVjk_kdH6nhXwJRnVDMFAkODkADBkO21aemrcWQkxDSLGZJnnZIdWlqF3d-/pub?gid=0&single=true&output=csv";

// Preguntas de respaldo (Offline / Garantizadas)
let preguntasRespaldo = [
  {
    id: 1,
    pregunta:
      "¿En qué año fue creada formalmente la Facultad de Medicina de la UBA?",
    opciones: ["1821", "1852", "1887"],
    correcta: 1, // Índice 1 = segunda opción (1852)
    explicacion: "Fue creada formalmente en 1852.",
    imagen: "imagenes/pregunta1.jpg",
  },
  {
    id: 2,
    pregunta: "¿Dónde funciona actualmente la Facultad de Medicina de la UBA?",
    opciones: ["Av. Córdoba", "Paraguay 2155", "Av. Las Heras"],
    correcta: 1,
    explicacion: "Funciona en Paraguay 2155.",
    imagen: "imagenes/pregunta2.jpg",
  },
  // Puedes agregar el resto de tus preguntas aquí o dejarlas sincronizar desde Sheets
];

let preguntasPartida = [];
let indicePreguntaActual = 0;
let puntajeActual = 0;
let respuestasCorrectas = 0;
let nombreJugador = "";
let idParticipante = "";
let temporizadorPregunta = null;
let temporizadorAvance = null;
let preguntaRespondida = false;
let contextoAudio = null;
let inicioPregunta = null;
let tiempoTotalRespuesta = 0;
let pantallaAnteriorRankingTiempos = "pantalla-inicio";
let solicitudRankingGlobal = 0;
const TIEMPO_POR_PREGUNTA = 15;
const TIEMPO_EXPLICACION = 4000;

// Reglas para el nombre del participante
const NOMBRE_MINIMO = 2;
const NOMBRE_MAXIMO = 15;
const MAX_APARICIONES_MISMO_NOMBRE_RANKING = 2;
const PALABRAS_PROHIBIDAS = [
  "puta", "puto", "putas", "putos", "mierda", "mierdas", "pelotudo",
  "pelotuda", "pelotudos", "pelotudas", "boludo", "boluda", "boludos",
  "boludas", "culo", "culos", "concha", "conchuda", "conchudo",
  "pija", "pijas", "pito", "verga", "verg", "cojudo", "cojuda",
  "cojudos", "cojudas", "forro", "forra", "forros", "forras",
  "choto", "chota", "chotos", "chotas", "hdp", "hijodeputa",
  "hijaputa", "cabron", "cabrona", "cabrones", "carajo", "joder",
  "fuck", "fucking", "shit", "bitch", "asshole", "dick", "pussy"
];

// Inicialización al cargar la página
window.addEventListener("DOMContentLoaded", () => {
  // Intentar actualizar desde Google Sheets en segundo plano
  sincronizarGoogleSheets();

 const inputNombre = document.getElementById("nombre-jugador");
  const btnComenzar = document.getElementById("btn-comenzar");

  inputNombre.addEventListener("input", () => {
    limpiarMensajeNombre();
    // Evita que el contador visual supere el máximo permitido.
    if (inputNombre.value.length > NOMBRE_MAXIMO) {
      inputNombre.value = inputNombre.value.slice(0, NOMBRE_MAXIMO);
    }
  });

  inputNombre.addEventListener("keydown", (evento) => {
    if (evento.key === "Enter") {
      evento.preventDefault();
      btnComenzar.click();
    }
  });

  btnComenzar.addEventListener("click", () => {
    const validacion = validarNombreJugador(inputNombre.value);

    if (!validacion.valido) {
      mostrarMensajeNombre(validacion.mensaje, "error");
      inputNombre.focus();
      return;
    }

    nombreJugador = normalizarNombreVisible(inputNombre.value);
    idParticipante = generarIdParticipante();
    limpiarMensajeNombre();
    iniciarTrivia();
  });

  document
    .getElementById("btn-ver-ranking-tiempos-final")
    .addEventListener("click", () => {
      mostrarRankingTiempos("pantalla-final");
    });
  document
    .getElementById("btn-volver-ranking-tiempos")
    .addEventListener("click", volverDesdeRankingTiempos);
});

function normalizarTextoParaFiltro(texto) {
  return texto
    .toLocaleLowerCase("es")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[@4]/g, "a")
    .replace(/[3]/g, "e")
    .replace(/[1!|]/g, "i")
    .replace(/[0]/g, "o")
    .replace(/[5$]/g, "s")
    .replace(/[7]/g, "t")
    .replace(/[^a-z0-9]/g, "");
}

function normalizarNombreClave(nombre) {
  return normalizarTextoParaFiltro(nombre);
}

function normalizarNombreVisible(nombre) {
  return nombre.trim().replace(/\s+/g, " ").slice(0, NOMBRE_MAXIMO);
}

function contienePalabraProhibida(nombre) {
  const originalNormalizado = nombre
    .toLocaleLowerCase("es")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  const compacto = normalizarTextoParaFiltro(nombre);
  const palabras = originalNormalizado.split(/[^a-z0-9]+/).filter(Boolean);

  return PALABRAS_PROHIBIDAS.some((prohibida) => {
    const palabra = normalizarTextoParaFiltro(prohibida);
    if (!palabra) return false;

    // Coincidencia por palabra completa.
    if (palabras.includes(palabra)) return true;

    // Detecta variantes sencillas con números/símbolos intercalados.
    // Solo se aplica a términos de 4 o más caracteres para reducir falsos positivos.
    return palabra.length >= 4 && compacto.includes(palabra);
  });
}

function validarNombreJugador(nombreOriginal) {
  const nombre = normalizarNombreVisible(nombreOriginal);

  if (nombre.length < NOMBRE_MINIMO) {
    return {
      valido: false,
      mensaje: `El nombre debe tener al menos ${NOMBRE_MINIMO} caracteres.`,
    };
  }

  if (nombre.length > NOMBRE_MAXIMO) {
    return {
      valido: false,
      mensaje: `El nombre puede tener como máximo ${NOMBRE_MAXIMO} caracteres.`,
    };
  }

  // Permite letras Unicode, espacios, números, punto, guion y apóstrofe.
  if (!/^[\p{L}\p{N} .'-]+$/u.test(nombre)) {
    return {
      valido: false,
      mensaje: "Usá solamente letras, números, espacios, punto o guion.",
    };
  }

  if (!/\p{L}/u.test(nombre)) {
    return {
      valido: false,
      mensaje: "El nombre debe contener al menos una letra.",
    };
  }

  if (contienePalabraProhibida(nombre)) {
    return {
      valido: false,
      mensaje: "Ese nombre no está permitido. Probá con otro nombre o apodo.",
    };
  }

  return { valido: true, nombre };
}

function mostrarMensajeNombre(mensaje, tipo = "error") {
  const elemento = document.getElementById("mensaje-nombre");
  if (!elemento) return;
  elemento.textContent = mensaje;
  elemento.className = `mensaje-nombre ${tipo}`;
  elemento.style.display = "block";
}

function limpiarMensajeNombre() {
  const elemento = document.getElementById("mensaje-nombre");
  if (!elemento) return;
  elemento.textContent = "";
  elemento.className = "mensaje-nombre";
  elemento.style.display = "none";
}

function generarIdParticipante() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }

  return `p-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function sincronizarGoogleSheets() {
  try {
    const respuesta = await fetch(URL_WEB_APP);
    if (!respuesta.ok) throw new Error("Error de red");
    const datosCSV = await respuesta.text();
    const preguntasRemotas = parsearCSV(datosCSV);
    if (preguntasRemotas.length > 0) {
      localStorage.setItem(
        "trivia_preguntas_cache",
        JSON.stringify(preguntasRemotas),
      );
      console.log("Preguntas sincronizadas con Google Sheets exitosamente.");
    }
  } catch (error) {
    console.log("Modo offline o error de CORS. Usando caché local o respaldo.");
  }
}

function parsearCSV(text) {
  const lineas = text.split("\n");
  let resultado = [];
  for (let i = 1; i < lineas.length; i++) {
    let linea = lineas[i].trim();
    if (!linea) continue;
    let cols = linea.split(","); // Nota: si tus celdas tienen comas, asegúrate de limpiarlas
    if (cols.length >= 8) {
      resultado.push({
        id: cols[0],
        pregunta: cols[1],
        opciones: [cols[2], cols[3], cols[4]],
        correcta: parseInt(cols[5]) - 1,
        explicacion: cols[6],
        imagen: "imagenes/" + cols[7].trim(),
      });
    }
  }
  return resultado;
}

function obtenerPreguntasDisponibles() {
  let cache = localStorage.getItem("trivia_preguntas_cache");
  if (cache) {
    try {
      return JSON.parse(cache);
    } catch (e) {
      return preguntasRespaldo;
    }
  }
  return preguntasRespaldo;
}

function iniciarTrivia() {
  clearInterval(temporizadorPregunta);
  clearTimeout(temporizadorAvance);
  prepararAudio();
  let pool = obtenerPreguntasDisponibles();
  // Mezclar aleatoriamente y tomar 10 (o las que haya)
  preguntasPartida = [...pool].sort(() => Math.random() - 0.5).slice(0, 10);
  indicePreguntaActual = 0;
  puntajeActual = 0;
  respuestasCorrectas = 0;
  tiempoTotalRespuesta = 0;

  // Cambiar de pantalla
  document.getElementById("pantalla-inicio").style.display = "none";
  document.getElementById("pantalla-juego").style.display = "flex";

  document.getElementById("info-jugador").textContent =
    `Jugador: ${nombreJugador}`;

  mostrarPreguntaActual();
}

function formatearPuntaje(valor) {
  return Number(valor)
    .toFixed(3)
    .replace(/\.0+$|(?<=\.\d)0+$/g, "");
}

function mostrarPreguntaActual() {
  clearInterval(temporizadorPregunta);
  clearTimeout(temporizadorAvance);
  if (indicePreguntaActual >= preguntasPartida.length) {
    finalizarTrivia();
    return;
  }

  preguntaRespondida = false;
  document.getElementById("tiempo-restante").textContent = TIEMPO_POR_PREGUNTA;
  document.querySelector(".reloj-pregunta").classList.remove("reloj-urgente");
  document.getElementById("explicacion-texto").style.display = "none";
  const q = preguntasPartida[indicePreguntaActual];
  document.getElementById("info-puntaje").textContent =
    `Puntaje: ${formatearPuntaje(puntajeActual)}`;
  document.getElementById("texto-pregunta").textContent =
    `${indicePreguntaActual + 1}. ${q.pregunta}`;

  // Manejo de imagen JPG
  const contenedorImg = document.getElementById("contenedor-imagen");
  const imagenAnterior = contenedorImg.querySelector("img");
  if (imagenAnterior) imagenAnterior.remove();
  contenedorImg.classList.remove("toast-sin-imagen");
  contenedorImg.classList.toggle("con-imagen", Boolean(q.imagen));
  if (q.imagen) {
    let img = document.createElement("img");
    img.src = q.imagen;
    img.alt = "Imagen de la pregunta";
    img.style.maxHeight = "200px";
    img.style.display = "block";
    img.style.margin = "10px auto";
    contenedorImg.appendChild(img);
  }

  // Opciones
  const opcionesContainer = document.getElementById("opciones-container");
  opcionesContainer.innerHTML = "";

  q.opciones.forEach((opcion, index) => {
    let btn = document.createElement("button");
    btn.textContent = opcion;
    btn.className = "btn-opcion";
    btn.onclick = () => evaluarRespuesta(index, q.correcta);
    opcionesContainer.appendChild(btn);
  });

  iniciarTemporizador();
}

function iniciarTemporizador() {
  const barraTiempo = document.getElementById("barra-tiempo");
  const contenedorBarra = barraTiempo.parentElement;
  const inicio = performance.now();
  inicioPregunta = inicio;

  barraTiempo.style.width = "100%";
  document.getElementById("tiempo-restante").textContent = TIEMPO_POR_PREGUNTA;
  contenedorBarra.setAttribute("aria-valuenow", TIEMPO_POR_PREGUNTA);
  contenedorBarra.setAttribute(
    "aria-valuetext",
    `${TIEMPO_POR_PREGUNTA} segundos`,
  );

  temporizadorPregunta = setInterval(() => {
    const tiempoRestante = Math.max(
      0,
      TIEMPO_POR_PREGUNTA - (performance.now() - inicio) / 1000,
    );
    const segundosRestantes = Math.ceil(tiempoRestante);

    barraTiempo.style.width = `${(tiempoRestante / TIEMPO_POR_PREGUNTA) * 100}%`;
    document.getElementById("tiempo-restante").textContent = segundosRestantes;
    contenedorBarra.setAttribute("aria-valuenow", segundosRestantes);
    contenedorBarra.setAttribute(
      "aria-valuetext",
      `${segundosRestantes} segundos`,
    );
    document
      .querySelector(".reloj-pregunta")
      .classList.toggle("reloj-urgente", tiempoRestante <= 5);

    if (tiempoRestante <= 0) {
      clearInterval(temporizadorPregunta);
      temporizadorPregunta = null;
      tiempoAgotado();
    }
  }, 1000);
}

function mostrarExplicacion(mensaje) {
  const explicacion = document.getElementById("explicacion-texto");
  const contenedorImg = document.getElementById("contenedor-imagen");
  explicacion.textContent = mensaje;
  explicacion.style.display = "block";
  if (!contenedorImg.classList.contains("con-imagen")) {
    contenedorImg.classList.add("toast-sin-imagen");
  }
}

function registrarTiempoRespuesta() {
  if (inicioPregunta === null) return 0;

  const tiempoTranscurrido = Math.min(
    TIEMPO_POR_PREGUNTA,
    Math.max(0, (performance.now() - inicioPregunta) / 1000),
  );
  tiempoTotalRespuesta += tiempoTranscurrido;
  inicioPregunta = null;
  return tiempoTranscurrido;
}

function evaluarRespuesta(elegida, correcta) {
  if (preguntaRespondida) return;
  preguntaRespondida = true;
  clearInterval(temporizadorPregunta);
  const tiempoRespuesta = registrarTiempoRespuesta();
  const botones = document.querySelectorAll(".btn-opcion");
  botones.forEach((b) => (b.disabled = true)); // Desactivar clics múltiples

  const pregunta = preguntasPartida[indicePreguntaActual];
  let mensajeExplicacion = "";

  if (elegida === correcta) {
    const puntosMaximosPregunta = 100 / preguntasPartida.length;
    const bonusRapidez =
      puntosMaximosPregunta * 0.5 * (1 - tiempoRespuesta / TIEMPO_POR_PREGUNTA);
    puntajeActual += puntosMaximosPregunta * 0.5 + bonusRapidez;
    respuestasCorrectas++;
    botones[elegida].style.backgroundColor = "#4CAF50"; // Verde
    mensajeExplicacion = `¡Correcto! Sumaste ${Math.round(puntosMaximosPregunta * 0.5 + bonusRapidez)} puntos. ${pregunta.explicacion || "La respuesta elegida fue la correcta."}`;
    reproducirSonido("correcta");
  } else {
    botones[elegida].style.backgroundColor = "#f44336"; // Rojo
    botones[correcta].style.backgroundColor = "#4CAF50"; // Marcar la correcta
    mensajeExplicacion = `Respuesta incorrecta. ${pregunta.explicacion || "La respuesta correcta fue la opción resaltada en verde."}`;
    reproducirSonido("incorrecta");
  }

  document.getElementById("info-puntaje").textContent =
    `Puntaje: ${Math.round(puntajeActual)}`;
  mostrarExplicacion(mensajeExplicacion);

  temporizadorAvance = setTimeout(() => {
    indicePreguntaActual++;
    mostrarPreguntaActual();
  }, TIEMPO_EXPLICACION);
}

function tiempoAgotado() {
  if (preguntaRespondida) return;
  preguntaRespondida = true;
  registrarTiempoRespuesta();
  reproducirSonido("tiempoAgotado");

  const pregunta = preguntasPartida[indicePreguntaActual];
  const botones = document.querySelectorAll(".btn-opcion");
  botones.forEach((boton) => (boton.disabled = true));
  botones[pregunta.correcta].style.backgroundColor = "#4CAF50";

  mostrarExplicacion(
    `Se acabó el tiempo. ${pregunta.explicacion || "La respuesta correcta está marcada en verde."}`,
  );

  temporizadorAvance = setTimeout(() => {
    indicePreguntaActual++;
    mostrarPreguntaActual();
  }, TIEMPO_EXPLICACION);
}

function prepararAudio() {
  const AudioContextDisponible =
    window.AudioContext || window.webkitAudioContext;
  if (!AudioContextDisponible) {
    console.warn("Este navegador no admite la reproducción de sonidos.");
    return;
  }

  if (!contextoAudio) {
    contextoAudio = new AudioContextDisponible();
  }

  contextoAudio.resume().catch((error) => {
    console.error("No se pudo activar el audio de la trivia.", error);
  });
}

function reproducirSonido(tipo) {
  if (!contextoAudio) return;

  const secuencias = {
    correcta: [
      { frecuencia: 523.25, duracion: 0.14 },
      { frecuencia: 659.25, duracion: 0.14 },
      { frecuencia: 783.99, duracion: 0.2 },
    ],
    incorrecta: [
      { frecuencia: 311.13, duracion: 0.2 },
      { frecuencia: 233.08, duracion: 0.28 },
    ],
    tiempoAgotado: [
      { frecuencia: 392, duracion: 0.22 },
      { frecuencia: 293.66, duracion: 0.3 },
    ],
  };
  const secuencia = secuencias[tipo];
  let inicio = contextoAudio.currentTime;

  secuencia.forEach(({ frecuencia, duracion }) => {
    const oscilador = contextoAudio.createOscillator();
    const volumen = contextoAudio.createGain();
    oscilador.type = "sine";
    oscilador.frequency.setValueAtTime(frecuencia, inicio);
    volumen.gain.setValueAtTime(0.0001, inicio);
    volumen.gain.exponentialRampToValueAtTime(0.16, inicio + 0.02);
    volumen.gain.exponentialRampToValueAtTime(0.0001, inicio + duracion);
    oscilador.connect(volumen);
    volumen.connect(contextoAudio.destination);
    oscilador.start(inicio);
    oscilador.stop(inicio + duracion);
    inicio += duracion;
  });
}

function finalizarTrivia() {
  clearInterval(temporizadorPregunta);
  clearTimeout(temporizadorAvance);
  document.getElementById("pantalla-juego").style.display = "none";
  document.getElementById("pantalla-final").style.display = "block";

  const puntajeFinal = Math.min(100, Math.round(puntajeActual));
  const totalPreguntas = preguntasPartida.length;
  const porcentaje = totalPreguntas > 0
    ? Math.round((respuestasCorrectas / totalPreguntas) * 100)
    : 0;
  const tiempoTotal = Math.round(tiempoTotalRespuesta * 10) / 10;
  const categoria = obtenerCategoria(puntajeFinal);

  document.getElementById("resultado-final").textContent =
    `🎓 ¡Felicitaciones, ${nombreJugador}!`;
  document.getElementById("resultado-categoria").textContent =
    `Obtuviste ${respuestasCorrectas}/${totalPreguntas} respuestas correctas`;
  document.getElementById("resultado-detalle").textContent =
    `🏆 ${categoria}`;
  document.getElementById("resultado-tiempo").textContent =
    `⏱️ Tiempo: ${new Intl.NumberFormat("es-AR", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(tiempoTotal)} segundos`;

  guardarEnRanking(
    nombreJugador,
    puntajeFinal,
    porcentaje,
    tiempoTotal,
    categoria,
  );
  guardarTiempoEnRanking(nombreJugador, tiempoTotal, puntajeFinal);
  guardarPuntajeEnRanking(
    nombreJugador,
    puntajeFinal,
    respuestasCorrectas,
    totalPreguntas,
    porcentaje,
    tiempoTotal,
  );
}

function obtenerCategoria(puntos) {
  if (puntos <= 50) return "🗺️ Visitante curioso";
  if (puntos > 50 && puntos <=60 ) return "🔎 Explorador";
  if (puntos > 60 && puntos <=80 ) return "🧭 Explorador avanzado";
  if (puntos > 80 && puntos <=90 ) return "🎓 Experto del museo";
    return "👑 Maestro del museo";
}

async function guardarPuntajeEnRanking(
  nombreJugador,
  puntos,
  correctasTotales,
  cantidadPreguntas,
  porcentaje,
  tiempo,
) {
  const datosJugador = {
    participante_id: idParticipante,
    nombre: nombreJugador,
    puntaje: puntos,
    correctas: correctasTotales,
    total: puntos,
    cantidad_preguntas: cantidadPreguntas,
    Cantidad_preguntas: cantidadPreguntas,
    totalPreguntas: cantidadPreguntas,
    porcentaje,
    tiempo,
  };
  const estadoGuardado = document.getElementById("estado-guardado");
  estadoGuardado.textContent = "Enviando el resultado a Google Sheets...";

  try {
    await fetch(SHEET_CSV_URL , {
      method: "POST",
      mode: "no-cors",
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
      },
      body: JSON.stringify(datosJugador),
    });
    estadoGuardado.textContent = "Resultado enviado.";
  } catch (error) {
    console.error("No se pudo enviar el puntaje a Google Sheets.", error);
    estadoGuardado.textContent =
      "No se pudo enviar el resultado a Google Sheets. Revisá la conexión e intentá nuevamente.";
  }
}

function guardarEnRanking(nombre, puntos, porcentaje, tiempo, categoria) {
  let ranking = JSON.parse(localStorage.getItem("API_Trivia_Ranking")) || [];
  const nombreClave = normalizarNombreClave(nombre);

  ranking.push({
    id: idParticipante || generarIdParticipante(),
    fecha: new Date().toLocaleDateString(),
    nombre,
    nombreClave,
    puntos,
    porcentaje,
    tiempo,
    categoria,
  });

  ranking.sort((a, b) => {
    const diferenciaPuntaje = b.puntos - a.puntos;
    if (diferenciaPuntaje !== 0) return diferenciaPuntaje;
    if (Number.isFinite(a.tiempo) && Number.isFinite(b.tiempo)) {
      return a.tiempo - b.tiempo;
    }
    return 0;
  });

  // Evita que el mismo nombre ocupe demasiados lugares del Top 5.
  // No bloquea a dos personas distintas con el mismo nombre.
  const apariciones = {};
  ranking = ranking.filter((item) => {
    const clave = item.nombreClave || normalizarNombreClave(item.nombre);
    apariciones[clave] = (apariciones[clave] || 0) + 1;
    return apariciones[clave] <= MAX_APARICIONES_MISMO_NOMBRE_RANKING;
  });

  ranking = ranking.slice(0, 5);
  localStorage.setItem("API_Trivia_Ranking", JSON.stringify(ranking));
}

function actualizarRankingVisual() {
  const lista = document.getElementById("lista-ranking");
  let ranking = JSON.parse(localStorage.getItem("API_Trivia_Ranking")) || [];

  if (ranking.length === 0) {
    lista.innerHTML = "<li>Aún no hay registros de puntajes.</li>";
    return;
  }

  lista.innerHTML = "";
  ranking.forEach((item, index) => {
    let li = document.createElement("li");
    const categoria = item.categoria || obtenerCategoria(item.puntos);
    const detalle = Number.isFinite(item.porcentaje)
      ? ` · ${item.porcentaje}% · ${item.tiempo} s`
      : "";
    li.textContent = `${item.nombre} - ${item.puntos} pts · ${categoria}${detalle}`;
    lista.appendChild(li);
  });
}

function guardarTiempoEnRanking(nombre, tiempo, puntos) {
  let ranking = JSON.parse(
    localStorage.getItem("API_Trivia_Ranking_Tiempos") || "[]",
  );
  if (ranking.length === 0) {
    const rankingAnterior = JSON.parse(
      localStorage.getItem("API_Trivia_Ranking") || "[]",
    );
    ranking = rankingAnterior
      .filter((partida) => Number.isFinite(partida.tiempo))
      .map((partida) => ({
        nombre: partida.nombre,
        tiempo: partida.tiempo,
        puntos: partida.puntos,
        fecha: partida.fecha,
      }));
  }
  ranking.push({
    id: idParticipante || generarIdParticipante(),
    nombre,
    nombreClave: normalizarNombreClave(nombre),
    tiempo,
    puntos,
    fecha: new Date().toLocaleDateString(),
  });
  ranking.sort((a, b) => a.tiempo - b.tiempo || b.puntos - a.puntos);

  const apariciones = {};
  ranking = ranking.filter((item) => {
    const clave = item.nombreClave || normalizarNombreClave(item.nombre);
    apariciones[clave] = (apariciones[clave] || 0) + 1;
    return apariciones[clave] <= MAX_APARICIONES_MISMO_NOMBRE_RANKING;
  });

  localStorage.setItem(
    "API_Trivia_Ranking_Tiempos",
    JSON.stringify(ranking.slice(0, 10)),
  );
}

async function actualizarRankingTiemposVisual() {
  const lista = document.getElementById("lista-ranking-tiempos");
  const estado = document.getElementById("estado-ranking-global");

  lista.innerHTML = "";
  estado.textContent = "⏳ Cargando ranking global...";

  try {
    const respuesta = await fetch(`${SHEET_CSV_URL}?tipo=ranking&ts=${Date.now()}`);

    if (!respuesta.ok) {
      throw new Error(`HTTP ${respuesta.status}`);
    }

    const ranking = await respuesta.json();

    if (!Array.isArray(ranking) || ranking.length === 0) {
      estado.textContent = "Todavía no hay resultados en el ranking global.";
      return;
    }

    const top10 = ranking.slice(0, 10);
    const podio = document.getElementById("ranking-podio");
    podio.innerHTML = "";

    // Podio visual para los tres primeros puestos.
    top10.slice(0, 3).forEach((partida, index) => {
      const tarjeta = document.createElement("div");
      tarjeta.className = `tarjeta-podio puesto-${index + 1}`;

      const tiempo = Number(partida.tiempo);
      const puntaje = Number(partida.puntaje);
      const correctas = Number(partida.correctas);
      const cantidadPreguntas = Number(partida.cantidad_preguntas);

      const medalla = index === 0 ? "🥇" : index === 1 ? "🥈" : "🥉";
      const tiempoTexto = Number.isFinite(tiempo) ? `${tiempo.toFixed(1)} s` : "—";
      const puntajeTexto = Number.isFinite(puntaje) ? `${puntaje} pts` : "—";
      const aciertosTexto = Number.isFinite(correctas) && Number.isFinite(cantidadPreguntas)
        ? `${correctas}/${cantidadPreguntas}`
        : "—";

      tarjeta.innerHTML = `
        <div class="podio-medalla">${medalla}</div>
        <div class="podio-puesto">${index + 1}° puesto</div>
        <div class="podio-nombre"></div>
        <div class="podio-puntaje">${puntajeTexto}</div>
        <div class="podio-detalle">${aciertosTexto} · ${tiempoTexto}</div>
      `;
      tarjeta.querySelector(".podio-nombre").textContent = partida.nombre || "Visitante";
      podio.appendChild(tarjeta);
    });

    // Del 4° al 10° se muestran como tarjetas compactas.
    top10.slice(3, 10).forEach((partida, index) => {
      const item = document.createElement("li");
      item.className = "fila-ranking-global";

      const tiempo = Number(partida.tiempo);
      const puntaje = Number(partida.puntaje);
      const correctas = Number(partida.correctas);
      const cantidadPreguntas = Number(partida.cantidad_preguntas);

      const posicion = index + 4;
      const tiempoTexto = Number.isFinite(tiempo) ? `${tiempo.toFixed(1)} s` : "—";
      const puntajeTexto = Number.isFinite(puntaje) ? `${puntaje} pts` : "—";
      const aciertosTexto = Number.isFinite(correctas) && Number.isFinite(cantidadPreguntas)
        ? `${correctas}/${cantidadPreguntas}`
        : "—";

      item.innerHTML = `
        <span class="ranking-posicion">${posicion}</span>
        <span class="ranking-nombre"></span>
        <span class="ranking-puntaje">${puntajeTexto}</span>
        <span class="ranking-meta">${aciertosTexto} · ${tiempoTexto}</span>
      `;
      item.querySelector(".ranking-nombre").textContent = partida.nombre || "Visitante";
      lista.appendChild(item);
    });

    estado.textContent = `Ranking global · ${top10.length} ${top10.length === 1 ? "resultado destacado" : "resultados destacados"}`;
  } catch (error) {
    console.error("No se pudo cargar el ranking global.", error);
    estado.textContent = "⚠️ No se pudo cargar el ranking global. Revisá la conexión e intentá nuevamente.";
  }
}

function mostrarRankingTiempos(pantallaOrigen) {
  pantallaAnteriorRankingTiempos = pantallaOrigen;
  document.getElementById(pantallaOrigen).style.display = "none";
  document.getElementById("pantalla-ranking-tiempos").style.display = "block";
  actualizarRankingTiemposVisual();
}

function volverDesdeRankingTiempos() {
  document.getElementById("pantalla-ranking-tiempos").style.display = "none";
  document.getElementById(pantallaAnteriorRankingTiempos).style.display = "block";
}
