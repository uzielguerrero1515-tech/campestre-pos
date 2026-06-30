import { useState, useRef, useEffect } from "react";
import { initializeApp } from "firebase/app";
import {
  getFirestore, collection, doc, setDoc, deleteDoc,
  onSnapshot, query, orderBy,
} from "firebase/firestore";

// ─── FIREBASE ────────────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyB-Pg5OPycsGK4klRD5lwrfmLdGeCVcgOY",
  authDomain: "campestre-pos.firebaseapp.com",
  projectId: "campestre-pos",
  storageBucket: "campestre-pos.firebasestorage.app",
  messagingSenderId: "150953726222",
  appId: "1:150953726222:web:904c2cc05ab450adf6475f",
};
const fbApp = initializeApp(firebaseConfig);
const db    = getFirestore(fbApp);

// Firestore collection refs — everything lives under these four collections
const cuentasCol   = collection(db, "cuentas");
const logsCol      = collection(db, "logs");
const employeesCol = collection(db, "employees");
const menuCol       = collection(db, "menu");

// ─── MENU ────────────────────────────────────────────────────────────────────
const INITIAL_MENU = [
  {
    id: "tacos", label: "Tacos", color: "#C0392B",
    items: [
      { id: "taco_suadero",       name: "Taco Suadero",         price: 25 },
      { id: "taco_longaniza",     name: "Taco Longaniza",        price: 20 },
      { id: "taco_bistec",        name: "Taco Bistec",           price: 23 },
      { id: "taco_camp_bistec",   name: "Campechano c/Bistec",   price: 22 },
      { id: "taco_camp_suadero",  name: "Campechano c/Suadero",  price: 22 },
    ]
  },
  {
    id: "gringas", label: "Gringas", color: "#922B21",
    items: [
      { id: "gringa_suadero",      name: "Gringa Suadero",          price: 55 },
      { id: "gringa_longaniza",    name: "Gringa Longaniza",         price: 48 },
      { id: "gringa_bistec",       name: "Gringa Bistec",            price: 55 },
      { id: "gringa_camp_bistec",  name: "Gringa Camp. c/Bistec",    price: 50 },
      { id: "gringa_camp_suadero", name: "Gringa Camp. c/Suadero",   price: 50 },
    ]
  },
  {
    id: "tortas", label: "Tortas", color: "#7B241C",
    items: [
      { id: "torta_suadero",      name: "Torta Suadero",        price: 85, hasQueso: true },
      { id: "torta_longaniza",    name: "Torta Longaniza",       price: 85, hasQueso: true },
      { id: "torta_bistec",       name: "Torta Bistec",          price: 85, hasQueso: true },
      { id: "torta_camp_bistec",  name: "Torta Camp. c/Bistec",  price: 85, hasQueso: true },
      { id: "torta_camp_suadero", name: "Torta Camp. c/Suadero", price: 85, hasQueso: true },
    ]
  },
  {
    id: "bebidas", label: "Bebidas", color: "#1A5276",
    items: [
      { id: "boing", name: "Boing de Mango", price: 25 },
      { id: "coca",  name: "Coca-Cola",      price: 35 },
    ]
  },
  {
    id: "promo", label: "Promo", color: "#B7950B",
    items: [
      { id: "promo_suadero", name: "Promo Camp. c/Suadero", price: 130, hasPromoBebida: true },
      { id: "promo_bistec",  name: "Promo Camp. c/Bistec",  price: 130, hasPromoBebida: true },
    ]
  },
];

const INITIAL_EMPLOYEES = [
  { id: "1", name: "Dueño",      pin: "0000", isOwner: true  },
  { id: "2", name: "Empleado 1", pin: "1111", isOwner: false },
];

// ─── HELPERS ─────────────────────────────────────────────────────────────────
// IMPORTANT: all dates are stored in ISO format (yyyy-mm-dd) so comparisons
// always match regardless of locale or single-digit days/months.
const dayKey = (d = new Date()) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};
const todayStr  = () => dayKey();              // canonical day key (yyyy-mm-dd)
const todayISO  = () => dayKey();              // same, for <input type=date>
const nowStr    = () => new Date().toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
const pad       = n  => String(n).padStart(2, "0");
const calcBruta = items => items.reduce((s, i) => s + i.price * i.qty, 0);
const calcNeta  = (bruta, pct) => bruta - bruta * (pct || 0) / 100;
// Total a cobrar de una cuenta: resta descuentos por producto y descuento de cuenta
const cuentaBruta = (cuenta) => calcBruta(cuenta.envios.flatMap(e => e.items));
const cuentaDescProductos = (cuenta) => cuenta.envios.flatMap(e => e.items).reduce((s, i) => s + (i.descuento?.monto || 0), 0);
const cuentaNeta = (cuenta) => {
  const bruta = cuentaBruta(cuenta);
  const descProd = cuentaDescProductos(cuenta);
  const subtotal = bruta - descProd;
  const descCuenta = cuenta.descuentoCuenta ? subtotal * cuenta.descuentoCuenta.pct / 100 : 0;
  return subtotal - descCuenta;
};

// Pretty-print an ISO day key as dd/mm/yyyy for display only
const prettyDate = (iso) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

// ─── PALETTE ─────────────────────────────────────────────────────────────────
const C = {
  red: "#E74C3C", darkRed: "#922B21", gold: "#FFD700", green: "#27AE60",
  purple: "#8E44AD", blue: "#2980B9", bg: "#111", card: "#1a1a1a",
  card2: "#222", border: "#333", muted: "#aaa", orange: "#E67E22",
};
const btn = (bg, extra = {}) => ({
  background: bg, border: "none", borderRadius: 10,
  color: "#fff", fontWeight: 700, cursor: "pointer", ...extra,
});
const inp = {
  width: "100%", background: C.card2, border: `1px solid ${C.border}`,
  borderRadius: 10, padding: "10px 12px", color: "#fff", fontSize: 14,
  marginBottom: 10, boxSizing: "border-box",
};
const overlay = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,.9)",
  display: "flex", alignItems: "center", justifyContent: "center",
  zIndex: 200, padding: 20,
};
const mbox = (borderColor) => ({
  background: C.card, borderRadius: 18, padding: 24,
  width: "100%", maxWidth: 360, border: `1px solid ${borderColor || C.red}`,
  maxHeight: "88vh", overflowY: "auto",
});
const mTitle = (color) => ({
  fontSize: 17, fontWeight: 800, color: color || C.red,
  textAlign: "center", marginBottom: 16,
});
const cancelBtn = {
  ...btn("transparent"), border: `1px solid ${C.border}`,
  padding: "10px 0", fontSize: 13, color: C.muted,
  width: "100%", marginTop: 8, borderRadius: 10,
};

// ─── NUMPAD ──────────────────────────────────────────────────────────────────
function NumPad({ value, onChange, onEnter, label }) {
  const nums = [7,8,9,4,5,6,1,2,3];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%" }}>
      {label && <div style={{ color: C.muted, fontSize: 13, textAlign: "center" }}>{label}</div>}
      <div style={{ background: C.card2, border: `2px solid ${C.red}`, borderRadius: 12, padding: "12px 24px", fontSize: 30, letterSpacing: 8, textAlign: "center", color: "#fff", minHeight: 58 }}>
        {value ? value.replace(/./g, "●") : "────"}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
        {nums.map(n => (
          <button key={n} style={{ ...btn(C.card2), border: `1px solid ${C.border}`, padding: "16px 0", fontSize: 20, borderRadius: 10 }}
            onClick={() => value.length < 6 && onChange(value + n)}>{n}</button>
        ))}
        <button style={{ ...btn(C.darkRed), padding: "16px 0", fontSize: 14, gridColumn: "span 2", borderRadius: 10 }}
          onClick={() => onChange(value.slice(0,-1))}>Borrar</button>
        <button style={{ ...btn(C.card2), border: `1px solid ${C.border}`, padding: "16px 0", fontSize: 20, borderRadius: 10 }}
          onClick={() => value.length < 6 && onChange(value + "0")}>0</button>
      </div>
      {onEnter && (
        <button style={{ ...btn(C.red), padding: "14px 0", fontSize: 16, borderRadius: 10 }} onClick={onEnter}>Entrar</button>
      )}
    </div>
  );
}

// ─── TORTA QUESO MODAL ───────────────────────────────────────────────────────
function TortaQuesoModal({ item, onConfirm, onClose }) {
  return (
    <div style={overlay}><div style={mbox(C.darkRed)}>
      <div style={mTitle(C.red)}>{item.name}</div>
      <div style={{ fontSize: 13, color: C.muted, textAlign: "center", marginBottom: 20 }}>¿Con queso?</div>
      <button style={{ ...btn(C.darkRed), padding: "14px 0", fontSize: 15, width: "100%", marginBottom: 10, borderRadius: 12 }}
        onClick={() => onConfirm({ ...item, name: item.name + " c/Queso", price: 95, detail: "Con Queso" })}>
        🧀 Con Queso — $95
      </button>
      <button style={{ ...btn(C.card2), border: `1px solid ${C.border}`, padding: "14px 0", fontSize: 15, width: "100%", marginBottom: 10, borderRadius: 12 }}
        onClick={() => onConfirm({ ...item, name: item.name + " s/Queso", price: 85, detail: "Sin Queso" })}>
        Sin Queso — $85
      </button>
      <button style={cancelBtn} onClick={onClose}>Cancelar</button>
    </div></div>
  );
}

// ─── PROMO BEBIDA MODAL ──────────────────────────────────────────────────────
function PromoBebidaModal({ item, onConfirm, onClose }) {
  return (
    <div style={overlay}><div style={mbox(C.gold)}>
      <div style={mTitle(C.gold)}>{item.name}</div>
      <div style={{ fontSize: 13, color: C.muted, textAlign: "center", marginBottom: 20 }}>¿Qué bebida incluye?</div>
      {[{ label: "Coca-Cola" }, { label: "Boing de Mango" }].map(b => (
        <button key={b.label} style={{ ...btn(C.gold), padding: "14px 0", fontSize: 15, width: "100%", marginBottom: 10, borderRadius: 12, color: "#111" }}
          onClick={() => onConfirm({ ...item, name: item.name + ` + ${b.label}`, detail: b.label })}>
          {b.label} — $130
        </button>
      ))}
      <button style={cancelBtn} onClick={onClose}>Cancelar</button>
    </div></div>
  );
}

// ─── COMMENT PRODUCT MODAL ───────────────────────────────────────────────────
function CommentProductModal({ item, onConfirm, onClose }) {
  const [text, setText] = useState(item.comment || "");
  return (
    <div style={overlay}><div style={mbox(C.orange)}>
      <div style={mTitle(C.orange)}>Comentario</div>
      <div style={{ fontSize: 13, color: C.muted, textAlign: "center", marginBottom: 14 }}>{item.name}</div>
      <textarea autoFocus
        style={{ width: "100%", background: C.card2, border: `1px solid ${C.border}`, borderRadius: 10, padding: 10, color: "#fff", fontSize: 14, resize: "none", height: 90, boxSizing: "border-box" }}
        placeholder="Ej: con verdura aparte, sin cebolla, bien cocido..."
        value={text} onChange={e => setText(e.target.value)} />
      <button style={{ ...btn(C.orange), padding: "13px 0", fontSize: 15, width: "100%", marginTop: 10, borderRadius: 10 }}
        onClick={() => onConfirm(text)}>Guardar</button>
      <button style={cancelBtn} onClick={onClose}>Cancelar</button>
    </div></div>
  );
}

// ─── ABRIR CUENTA MODAL ──────────────────────────────────────────────────────
function AbrirCuentaModal({ cuentaNum, onConfirm, onClose }) {
  const [tipo, setTipo]           = useState(null);
  const [comentario, setComentario] = useState("");
  return (
    <div style={overlay}><div style={mbox(C.gold)}>
      <div style={mTitle(C.gold)}>Cuenta {pad(cuentaNum)}</div>
      <div style={{ fontSize: 13, color: C.muted, textAlign: "center", marginBottom: 20 }}>Selecciona el tipo de servicio</div>
      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        {["Para llevar","Comer aquí"].map(t => (
          <button key={t} style={{ ...btn(tipo === t ? C.red : C.card2), flex: 1, padding: "16px 0", fontSize: 14, border: tipo === t ? "none" : `1px solid ${C.border}`, borderRadius: 12 }}
            onClick={() => setTipo(t)}>
            {t === "Para llevar" ? "🥡 Para llevar" : "🍽️ Comer aquí"}
          </button>
        ))}
      </div>
      <div style={{ fontSize: 13, color: C.muted, marginBottom: 6 }}>Comentario (opcional)</div>
      <input style={inp} placeholder="Ej: cliente frecuente, gorra azul..." value={comentario} onChange={e => setComentario(e.target.value)} />
      <button style={{ ...btn(tipo ? C.green : "#444"), padding: "14px 0", fontSize: 16, width: "100%", borderRadius: 12, opacity: tipo ? 1 : 0.5 }}
        onClick={() => { if (!tipo) return alert("Selecciona para llevar o comer aquí"); onConfirm(tipo, comentario); }}>
        Abrir cuenta
      </button>
      <button style={cancelBtn} onClick={onClose}>Cancelar</button>
    </div></div>
  );
}

// ─── COBRAR MODAL ────────────────────────────────────────────────────────────
function CobrarModal({ cuenta, onConfirm, onClose }) {
  const [metodo, setMetodo]               = useState(null);
  const [efectivo, setEfectivo]           = useState("");
  const [tarjeta, setTarjeta]             = useState("");
  const [transferencia, setTransferencia] = useState("");
  const [propina, setPropina]             = useState("");

  const allItems = cuenta.envios.flatMap(e => e.items);
  const bruta    = calcBruta(allItems);
  const neta     = cuentaNeta(cuenta);
  const totalDescMonto = bruta - neta;

  const handlePagar = () => {
    if (!metodo) return alert("Selecciona forma de pago");
    const pago = {
      metodo,
      efectivo:      metodo === "Mixto" ? Number(efectivo) || 0      : metodo === "Efectivo"      ? neta : 0,
      tarjeta:       metodo === "Mixto" ? Number(tarjeta) || 0       : metodo === "Tarjeta"       ? neta : 0,
      transferencia: metodo === "Mixto" ? Number(transferencia) || 0 : metodo === "Transferencia" ? neta : 0,
      propina: Number(propina) || 0,
    };
    if (metodo === "Mixto") {
      const total = pago.efectivo + pago.tarjeta + pago.transferencia;
      if (total < neta - 0.5) return alert(`Faltan $${(neta - total).toFixed(0)} para cubrir el total de $${neta.toFixed(0)}`);
    }
    onConfirm(pago);
  };

  return (
    <div style={overlay}><div style={mbox(C.green)}>
      <div style={mTitle(C.green)}>Cobrar Cuenta {pad(cuenta.num)}</div>
      {cuenta.comentario && <div style={{ fontSize: 12, color: C.muted, textAlign: "center", marginBottom: 12 }}>{cuenta.comentario}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
        {[
          ["Venta bruta",    `$${bruta.toFixed(0)}`, C.muted],
          ["Total a cobrar", `$${neta.toFixed(0)}`,  C.gold],
          totalDescMonto > 0 && ["Descuento", `-$${totalDescMonto.toFixed(0)}`, C.purple],
        ].filter(Boolean).map(([l, v, col]) => (
          <div key={l} style={{ background: C.card2, borderRadius: 10, padding: "10px 12px" }}>
            <div style={{ fontSize: 12, color: C.muted }}>{l}</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: col }}>{v}</div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 13, color: C.muted, marginBottom: 8 }}>Forma de pago</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
        {["Efectivo","Tarjeta","Transferencia","Mixto"].map(m => (
          <button key={m} style={{ ...btn(metodo === m ? C.green : C.card2), padding: "12px 0", fontSize: 13, border: metodo === m ? "none" : `1px solid ${C.border}`, borderRadius: 10 }}
            onClick={() => setMetodo(m)}>{m}</button>
        ))}
      </div>
      {metodo === "Mixto" && <>
        <div style={{ fontSize: 13, color: C.muted, marginBottom: 8 }}>Total: <b style={{ color: C.gold }}>${neta.toFixed(0)}</b></div>
        <input style={inp} type="number" placeholder="Efectivo $"       value={efectivo}      onChange={e => setEfectivo(e.target.value)} />
        <input style={inp} type="number" placeholder="Tarjeta $"        value={tarjeta}       onChange={e => setTarjeta(e.target.value)} />
        <input style={inp} type="number" placeholder="Transferencia $"  value={transferencia} onChange={e => setTransferencia(e.target.value)} />
      </>}
      <input style={inp} type="number" placeholder="Propina $ (opcional)" value={propina} onChange={e => setPropina(e.target.value)} />
      <button style={{ ...btn(C.green), padding: "14px 0", fontSize: 16, width: "100%", borderRadius: 12, marginTop: 4 }}
        onClick={handlePagar}>Pagar — ${neta.toFixed(0)}</button>
      <button style={cancelBtn} onClick={onClose}>Cancelar</button>
    </div></div>
  );
}

// ─── ELIMINAR PRODUCTOS MODAL ────────────────────────────────────────────────
// Owner enters PIN, then selects which products (and how many) to remove from
// the account, with motive + who authorizes. Logged for the owner.
function EliminarProductosModal({ cuenta, employees, onConfirm, onClose }) {
  const [step, setStep]   = useState("pin");
  const [pin, setPin]     = useState("");
  const [motivo, setMotivo] = useState("");
  const [nombre, setNombre] = useState("");

  // Build a flat working list of all sent lines: {envioId, idx, item, removeQty}
  const [lines, setLines] = useState(() =>
    cuenta.envios.flatMap(e => e.items.map((item, idx) => ({
      envioId: e.id, idx, item, removeQty: 0,
    })))
  );

  const handlePin = () => {
    if (employees.find(e => e.pin === pin && e.isOwner)) setStep("select");
    else { setPin(""); alert("PIN de dueño incorrecto"); }
  };

  const setRemove = (i, delta) => setLines(prev => prev.map((l, idx) =>
    idx === i ? { ...l, removeQty: Math.max(0, Math.min(l.item.qty, l.removeQty + delta)) } : l));

  const totalToRemove = lines.reduce((s, l) => s + l.removeQty, 0);

  const handleConfirm = () => {
    if (totalToRemove === 0) return alert("Selecciona al menos un producto a eliminar");
    if (!motivo.trim() || !nombre.trim()) return alert("Falta el motivo y quién autoriza");
    onConfirm({ lines: lines.filter(l => l.removeQty > 0), motivo: motivo.trim(), nombre: nombre.trim() });
  };

  if (step === "pin") return (
    <div style={overlay}><div style={mbox()}>
      <div style={mTitle()}>PIN Dueño para eliminar productos</div>
      <NumPad value={pin} onChange={setPin} onEnter={handlePin} />
      <button style={cancelBtn} onClick={onClose}>Cancelar</button>
    </div></div>
  );

  if (step === "select") return (
    <div style={overlay}><div style={mbox()}>
      <div style={mTitle()}>Selecciona qué eliminar</div>
      <div style={{ fontSize: 12, color: C.muted, textAlign: "center", marginBottom: 14 }}>Cuenta {pad(cuenta.num)}</div>
      {lines.length === 0 && <div style={{ color: "#555", fontSize: 13, textAlign: "center" }}>Sin productos</div>}
      {lines.map((l, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: `1px solid #2a2a2a` }}>
          <div style={{ flex: 1, fontSize: 13 }}>
            <div style={{ color: l.removeQty > 0 ? C.red : "#eee" }}>{l.item.qty}× {l.item.name}</div>
            {l.item.comment && <div style={{ color: C.orange, fontSize: 11 }}>C: {l.item.comment}</div>}
            {l.removeQty > 0 && <div style={{ color: C.red, fontSize: 11 }}>Quitar {l.removeQty}</div>}
          </div>
          <button style={{ ...btn(C.card2), padding: "2px 10px", fontSize: 16, borderRadius: 8, border: `1px solid ${C.border}` }}
            onClick={() => setRemove(i, -1)}>−</button>
          <span style={{ minWidth: 18, textAlign: "center", fontWeight: 700, color: C.red }}>{l.removeQty}</span>
          <button style={{ ...btn(C.darkRed), padding: "2px 10px", fontSize: 16, borderRadius: 8 }}
            onClick={() => setRemove(i, +1)}>+</button>
        </div>
      ))}
      <button style={{ ...btn(totalToRemove ? C.red : "#444"), padding: "13px 0", fontSize: 15, width: "100%", borderRadius: 12, marginTop: 14, opacity: totalToRemove ? 1 : 0.5 }}
        onClick={() => { if (totalToRemove === 0) return alert("Selecciona productos"); setStep("motivo"); }}>
        Continuar ({totalToRemove})
      </button>
      <button style={cancelBtn} onClick={onClose}>Cancelar</button>
    </div></div>
  );

  return (
    <div style={overlay}><div style={mbox()}>
      <div style={mTitle()}>Motivo de eliminación</div>
      <div style={{ fontSize: 13, color: C.muted, marginBottom: 6 }}>Nombre de quien autoriza</div>
      <input style={inp} placeholder="Nombre" value={nombre} onChange={e => setNombre(e.target.value)} />
      <div style={{ fontSize: 13, color: C.muted, marginBottom: 6 }}>Motivo</div>
      <textarea style={{ ...inp, height: 80, resize: "none" }} placeholder="Ej: el cliente cambió de opinión, error al ordenar..." value={motivo} onChange={e => setMotivo(e.target.value)} />
      <button style={{ ...btn(C.red), padding: "13px 0", fontSize: 15, width: "100%", borderRadius: 12 }}
        onClick={handleConfirm}>Eliminar {totalToRemove} producto{totalToRemove === 1 ? "" : "s"}</button>
      <button style={cancelBtn} onClick={() => setStep("select")}>Atrás</button>
    </div></div>
  );
}

// ─── DESCUENTO MODAL (por producto con cantidad+%, o cuenta completa) ─────────
function DescuentoModal({ cuenta, employees, onConfirm, onClose }) {
  const [step, setStep]     = useState("pin");   // pin → mode → select/global → motivo
  const [pin, setPin]       = useState("");
  const [mode, setMode]     = useState(null);    // "producto" | "cuenta"
  const [nombre, setNombre] = useState("");
  const [motivo, setMotivo] = useState("");
  const [globalPct, setGlobalPct] = useState("");

  // Flat list with per-line qty + pct
  const [lines, setLines] = useState(() =>
    cuenta.envios.flatMap(e => e.items.map((item, idx) => ({
      envioId: e.id, idx, item, selected: false, qty: item.qty, pct: 0,
    })))
  );

  const handlePin = () => {
    if (employees.find(e => e.pin === pin && e.isOwner)) setStep("mode");
    else { setPin(""); alert("PIN de dueño incorrecto"); }
  };

  const toggleLine = (i) => setLines(prev => prev.map((l, idx) =>
    idx === i ? { ...l, selected: !l.selected, qty: l.item.qty, pct: l.selected ? 0 : l.pct } : l));
  const setQty = (i, delta) => setLines(prev => prev.map((l, idx) =>
    idx === i ? { ...l, qty: Math.max(1, Math.min(l.item.qty, l.qty + delta)) } : l));
  const setPct = (i, val) => setLines(prev => prev.map((l, idx) =>
    idx === i ? { ...l, pct: Math.min(100, Math.max(0, Number(val) || 0)) } : l));

  const selected = lines.filter(l => l.selected);
  const hasValid = selected.length > 0 && selected.every(l => l.pct > 0);

  const bruta = calcBruta(cuenta.envios.flatMap(e => e.items));

  // ── STEP 1: PIN ──
  if (step === "pin") return (
    <div style={overlay}><div style={mbox(C.purple)}>
      <div style={mTitle(C.purple)}>PIN Dueño para descuento</div>
      <NumPad value={pin} onChange={setPin} onEnter={handlePin} />
      <button style={cancelBtn} onClick={onClose}>Cancelar</button>
    </div></div>
  );

  // ── STEP 2: CHOOSE MODE ──
  if (step === "mode") return (
    <div style={overlay}><div style={mbox(C.purple)}>
      <div style={mTitle(C.purple)}>Tipo de descuento</div>
      <button style={{ ...btn(C.purple), padding: "16px 0", fontSize: 15, width: "100%", marginBottom: 12, borderRadius: 12 }}
        onClick={() => { setMode("producto"); setStep("select"); }}>
        🎯 Por producto<br/><span style={{ fontSize: 12, fontWeight: 400, opacity: 0.85 }}>Eliges productos, cantidad y % de cada uno</span>
      </button>
      <button style={{ ...btn(C.blue), padding: "16px 0", fontSize: 15, width: "100%", borderRadius: 12 }}
        onClick={() => { setMode("cuenta"); setStep("global"); }}>
        🧾 A toda la cuenta<br/><span style={{ fontSize: 12, fontWeight: 400, opacity: 0.85 }}>Un % sobre el total de la cuenta</span>
      </button>
      <button style={cancelBtn} onClick={onClose}>Cancelar</button>
    </div></div>
  );

  // ── STEP 3a: PER-PRODUCT SELECT ──
  if (step === "select") return (
    <div style={overlay}><div style={mbox(C.purple)}>
      <div style={mTitle(C.purple)}>Descuento por producto</div>
      <div style={{ fontSize: 12, color: C.muted, textAlign: "center", marginBottom: 14 }}>Selecciona, elige cuántas piezas y el %</div>
      {lines.length === 0 && <div style={{ color: "#555", fontSize: 13, textAlign: "center" }}>Sin productos</div>}
      {lines.map((l, i) => (
        <div key={i} style={{ padding: "10px 0", borderBottom: `1px solid #2a2a2a` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button style={{ ...btn(l.selected ? C.purple : C.card2), width: 28, height: 28, borderRadius: 8, fontSize: 14, padding: 0, border: l.selected ? "none" : `1px solid ${C.border}`, flexShrink: 0 }}
              onClick={() => toggleLine(i)}>{l.selected ? "✓" : ""}</button>
            <div style={{ flex: 1, fontSize: 13, color: l.selected ? "#fff" : C.muted }}>
              {l.item.qty}× {l.item.name}
              {l.item.comment && <div style={{ color: C.orange, fontSize: 11 }}>C: {l.item.comment}</div>}
            </div>
            <div style={{ fontSize: 13, color: C.gold }}>${l.item.price * l.item.qty}</div>
          </div>
          {l.selected && (
            <div style={{ marginTop: 10, paddingLeft: 36, display: "flex", flexDirection: "column", gap: 10 }}>
              {/* qty selector — only if more than 1 */}
              {l.item.qty > 1 && (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 13, color: C.muted, minWidth: 70 }}>¿Cuántas?</span>
                  <button style={{ ...btn(C.card2), padding: "2px 10px", fontSize: 16, borderRadius: 8, border: `1px solid ${C.border}` }}
                    onClick={() => setQty(i, -1)}>−</button>
                  <span style={{ minWidth: 24, textAlign: "center", fontWeight: 700 }}>{l.qty}</span>
                  <button style={{ ...btn(C.purple), padding: "2px 10px", fontSize: 16, borderRadius: 8 }}
                    onClick={() => setQty(i, +1)}>+</button>
                  <span style={{ fontSize: 12, color: C.muted }}>de {l.item.qty}</span>
                </div>
              )}
              {/* pct */}
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 13, color: C.muted, minWidth: 70 }}>Descuento</span>
                <input style={{ ...inp, marginBottom: 0, width: 70, textAlign: "center" }} type="number" min="1" max="100"
                  placeholder="%" value={l.pct || ""} onChange={e => setPct(i, e.target.value)} />
                <span style={{ fontSize: 13, color: C.purple }}>%</span>
                {l.pct > 0 && <span style={{ fontSize: 12, color: C.gold }}>−${((l.item.price * l.qty) * l.pct / 100).toFixed(0)}</span>}
              </div>
            </div>
          )}
        </div>
      ))}
      <button style={{ ...btn(hasValid ? C.purple : "#444"), padding: "13px 0", fontSize: 15, width: "100%", borderRadius: 12, marginTop: 14, opacity: hasValid ? 1 : 0.5 }}
        onClick={() => { if (!hasValid) return alert("Selecciona productos y asigna % a cada uno"); setStep("motivo"); }}>
        Continuar ({selected.length})
      </button>
      <button style={cancelBtn} onClick={() => setStep("mode")}>Atrás</button>
    </div></div>
  );

  // ── STEP 3b: WHOLE ACCOUNT ──
  if (step === "global") {
    const monto = bruta * (Number(globalPct) || 0) / 100;
    return (
      <div style={overlay}><div style={mbox(C.blue)}>
        <div style={mTitle(C.blue)}>Descuento a toda la cuenta</div>
        <div style={{ background: C.card2, borderRadius: 10, padding: 12, marginBottom: 14, textAlign: "center" }}>
          <div style={{ fontSize: 12, color: C.muted }}>Total de la cuenta</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: C.gold }}>${bruta.toFixed(0)}</div>
        </div>
        <div style={{ fontSize: 13, color: C.muted, marginBottom: 6 }}>% de descuento sobre todo</div>
        <input style={inp} type="number" min="1" max="100" placeholder="Ej. 20" value={globalPct} onChange={e => setGlobalPct(e.target.value)} />
        {Number(globalPct) > 0 && (
          <div style={{ textAlign: "center", marginBottom: 12, fontSize: 14 }}>
            <span style={{ color: C.purple }}>−${monto.toFixed(0)}</span>
            <span style={{ color: C.muted }}> · Quedaría en </span>
            <span style={{ color: C.gold, fontWeight: 700 }}>${(bruta - monto).toFixed(0)}</span>
          </div>
        )}
        <button style={{ ...btn(Number(globalPct) > 0 ? C.blue : "#444"), padding: "13px 0", fontSize: 15, width: "100%", borderRadius: 12, opacity: Number(globalPct) > 0 ? 1 : 0.5 }}
          onClick={() => { if (!(Number(globalPct) > 0)) return alert("Pon un % válido"); setStep("motivo"); }}>
          Continuar
        </button>
        <button style={cancelBtn} onClick={() => setStep("mode")}>Atrás</button>
      </div></div>
    );
  }

  // ── STEP 4: MOTIVO ──
  const totalDesc = mode === "cuenta"
    ? bruta * (Number(globalPct) || 0) / 100
    : selected.reduce((s, l) => s + (l.item.price * l.qty) * l.pct / 100, 0);

  return (
    <div style={overlay}><div style={mbox(C.purple)}>
      <div style={mTitle(C.purple)}>Autorización de descuento</div>
      <div style={{ background: C.card2, borderRadius: 10, padding: 12, marginBottom: 14 }}>
        {mode === "cuenta" ? (
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 700 }}>
            <span>Toda la cuenta −{globalPct}%</span>
            <span style={{ color: C.gold }}>−${totalDesc.toFixed(0)}</span>
          </div>
        ) : <>
          {selected.map((l, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "4px 0" }}>
              <span>{l.qty}× {l.item.name} −{l.pct}%</span>
              <span style={{ color: C.purple }}>−${((l.item.price * l.qty) * l.pct / 100).toFixed(0)}</span>
            </div>
          ))}
          <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 8, paddingTop: 8, display: "flex", justifyContent: "space-between", fontWeight: 800 }}>
            <span style={{ color: C.muted }}>Total descuento</span>
            <span style={{ color: C.gold }}>−${totalDesc.toFixed(0)}</span>
          </div>
        </>}
      </div>
      <div style={{ fontSize: 13, color: C.muted, marginBottom: 6 }}>Nombre de quien autoriza</div>
      <input style={inp} placeholder="Nombre" value={nombre} onChange={e => setNombre(e.target.value)} />
      <div style={{ fontSize: 13, color: C.muted, marginBottom: 6 }}>Motivo</div>
      <textarea style={{ ...inp, height: 75, resize: "none" }} placeholder="Ej: cliente frecuente, error en orden..." value={motivo} onChange={e => setMotivo(e.target.value)} />
      <button style={{ ...btn(C.purple), padding: "13px 0", fontSize: 15, width: "100%", borderRadius: 12 }}
        onClick={() => {
          if (!nombre.trim() || !motivo.trim()) return alert("Falta nombre y motivo");
          if (mode === "cuenta") onConfirm({ mode: "cuenta", globalPct: Number(globalPct), motivo: motivo.trim(), nombre: nombre.trim() });
          else onConfirm({ mode: "producto", lines: selected, motivo: motivo.trim(), nombre: nombre.trim() });
        }}>Aplicar descuento</button>
      <button style={cancelBtn} onClick={() => setStep(mode === "cuenta" ? "global" : "select")}>Atrás</button>
    </div></div>
  );
}

// ─── CUENTA DETAIL ───────────────────────────────────────────────────────────
function CuentaDetail({ cuenta, menu, currentUser, employees, onBack, onUpdate, onCobrar, onEliminarProductos, onDescuento }) {
  const [activeSection,  setActiveSection]  = useState(menu[0]?.id);
  const [pendingItems,   setPendingItems]   = useState([]);
  const [tortaModal,     setTortaModal]     = useState(null);
  const [promoModal,     setPromoModal]     = useState(null);
  const [commentModal,   setCommentModal]   = useState(null);
  const [descuentoModal, setDescuentoModal] = useState(false);
  const [cobrarModal,    setCobrarModal]    = useState(false);
  const [eliminarModal,  setEliminarModal]  = useState(false);
  const comandaRef = useRef(null);

  const currentSection = menu.find(s => s.id === activeSection);
  const allSentItems   = cuenta.envios.flatMap(e => e.items);
  const bruta = calcBruta(allSentItems);
  const totalDescMonto = bruta - cuentaNeta(cuenta);
  const neta  = cuentaNeta(cuenta);

  const addPending = (item) => {
    setPendingItems(prev => {
      const key = item.id + (item.detail || "");
      const ex  = prev.find(i => (i.id + (i.detail || "")) === key);
      if (ex) return prev.map(i => (i.id + (i.detail || "")) === key ? { ...i, qty: i.qty + 1 } : i);
      return [...prev, { ...item, qty: 1, comment: "" }];
    });
  };

  const handleMenuItem = (item) => {
    if (item.hasQueso)       { setTortaModal(item); return; }
    if (item.hasPromoBebida) { setPromoModal(item); return; }
    addPending(item);
  };

  const removePending = (idx) => setPendingItems(prev => prev.filter((_, i) => i !== idx));

  const handleEnviar = () => {
    if (pendingItems.length === 0) return alert("Agrega productos primero");
    const envio   = { id: Date.now(), hora: nowStr(), items: pendingItems };
    const updated = { ...cuenta, envios: [...cuenta.envios, envio] };
    onUpdate(updated);
    setPendingItems([]);
    setTimeout(() => comandaRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  };

  const sectionColor = menu.find(s => s.id === activeSection)?.color || C.red;

  return (
    <div style={{ fontFamily: "'Inter',sans-serif", background: C.bg, minHeight: "100vh", color: "#fff", maxWidth: 480, margin: "0 auto", display: "flex", flexDirection: "column" }}>

      {/* Top bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: C.card, borderBottom: `2px solid ${C.red}` }}>
        <button style={{ ...btn(C.card2), padding: "6px 12px", fontSize: 13, borderRadius: 8 }} onClick={onBack}>← Cuentas</button>
        <div style={{ textAlign: "center" }}>
          <span style={{ fontWeight: 800, color: C.gold, fontSize: 16 }}>Cuenta {pad(cuenta.num)}</span>
          {cuenta.comentario && <div style={{ fontSize: 11, color: C.muted }}>{cuenta.comentario}</div>}
        </div>
        <span style={{ fontSize: 12, background: cuenta.tipo === "Para llevar" ? C.blue : C.green, padding: "4px 8px", borderRadius: 8, fontWeight: 700 }}>
          {cuenta.tipo === "Para llevar" ? "🥡" : "🍽️"}
        </span>
      </div>

      {/* Section tabs */}
      <div style={{ display: "flex", overflowX: "auto", gap: 8, padding: "10px 14px", background: "#161616" }}>
        {menu.map(s => (
          <button key={s.id} style={{ ...btn(activeSection === s.id ? s.color : "#2a2a2a"), padding: "9px 14px", fontSize: 13, borderRadius: 10, whiteSpace: "nowrap", opacity: activeSection === s.id ? 1 : 0.7 }}
            onClick={() => setActiveSection(s.id)}>{s.label}</button>
        ))}
      </div>

      {/* Menu grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, padding: "12px 14px" }}>
        {currentSection?.items.filter(i => i.active !== false).map(item => (
          <button key={item.id} style={{ ...btn(sectionColor), padding: "16px 10px", borderRadius: 14, textAlign: "center" }}
            onClick={() => handleMenuItem(item)}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4, lineHeight: 1.3 }}>{item.name}</div>
            <div style={{ fontSize: 17, fontWeight: 800, color: C.gold }}>
              {item.hasQueso ? "$85 / $95" : `$${item.price}`}
            </div>
          </button>
        ))}
      </div>

      {/* Pending items */}
      {pendingItems.length > 0 && (
        <div style={{ margin: "0 14px", background: "#1e1e1e", borderRadius: 14, padding: 12, border: `1px solid ${C.orange}` }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.orange, marginBottom: 8 }}>Por enviar</div>
          {pendingItems.map((item, idx) => (
            <div key={idx} style={{ display: "flex", alignItems: "center", marginBottom: 6, gap: 6 }}>
              <button style={{ ...btn(C.card2), padding: "2px 8px", fontSize: 16, borderRadius: 8, border: `1px solid ${C.border}` }}
                onClick={() => setPendingItems(prev => prev.map((it, i) => i === idx ? { ...it, qty: Math.max(1, it.qty - 1) } : it))}>−</button>
              <span style={{ fontSize: 14, fontWeight: 700, minWidth: 20, textAlign: "center" }}>{item.qty}</span>
              <button style={{ ...btn(C.card2), padding: "2px 8px", fontSize: 16, borderRadius: 8, border: `1px solid ${C.border}` }}
                onClick={() => setPendingItems(prev => prev.map((it, i) => i === idx ? { ...it, qty: it.qty + 1 } : it))}>+</button>
              <div style={{ flex: 1, fontSize: 13 }}>
                <div style={{ color: "#eee", lineHeight: 1.3 }}>{item.name}</div>
                {item.comment ? <div style={{ color: C.orange, fontSize: 11 }}>C: {item.comment}</div> : null}
              </div>
              <span style={{ color: C.gold, fontSize: 13, fontWeight: 700 }}>${item.price * item.qty}</span>
              <button style={{ ...btn("transparent"), color: C.orange, fontSize: 16, padding: "2px 4px" }}
                onClick={() => setCommentModal({ item, idx })}>💬</button>
              <button style={{ ...btn("transparent"), color: C.red, fontSize: 20, padding: "0 4px" }}
                onClick={() => removePending(idx)}>×</button>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.border}` }}>
            <span style={{ fontSize: 13, color: C.muted }}>Subtotal</span>
            <span style={{ fontSize: 16, fontWeight: 800, color: C.gold }}>${calcBruta(pendingItems).toFixed(0)}</span>
          </div>
          <button style={{ ...btn(C.red), padding: "11px 0", fontSize: 14, width: "100%", borderRadius: 10, marginTop: 10 }}
            onClick={handleEnviar}>Enviar ✓</button>
        </div>
      )}

      {/* Comanda */}
      <div ref={comandaRef} style={{ flex: 1, overflowY: "auto", padding: "12px 14px" }}>
        {cuenta.envios.length === 0
          ? <div style={{ textAlign: "center", color: "#444", padding: 30, fontSize: 14 }}>Sin productos enviados aún</div>
          : <>
            <div style={{ background: "#1e1e1e", borderRadius: 12, padding: 12, marginBottom: 10, border: `1px solid ${C.border}` }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, fontSize: 12 }}>
                <div><span style={{ color: C.muted }}>Usuario: </span><b>{cuenta.abiertaPor}</b></div>
                <div><span style={{ color: C.muted }}>Cuenta: </span><b style={{ color: C.gold }}>{pad(cuenta.num)}</b></div>
                {cuenta.comentario && <div style={{ gridColumn: "span 2" }}><span style={{ color: C.muted }}>Comentario: </span>{cuenta.comentario}</div>}
                <div><span style={{ color: C.muted }}>Tipo: </span>{cuenta.tipo}</div>
                <div><span style={{ color: C.muted }}>Apertura: </span>{cuenta.horaAbierta}</div>
              </div>
            </div>
            {cuenta.envios.map((envio, ei) => (
              <div key={envio.id}>
                <div style={{ background: "#1a1a1a", borderRadius: 12, padding: 12, marginBottom: 4, border: `1px solid #2a2a2a` }}>
                  {envio.items.map((item, ii) => (
                    <div key={ii} style={{ marginBottom: 8 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                        <span style={{ fontWeight: 700 }}>{item.qty}× {item.name}</span>
                        <span style={{ color: C.muted, fontSize: 12 }}>{envio.hora}</span>
                      </div>
                      {item.comment && <div style={{ color: C.orange, fontSize: 12, paddingLeft: 12 }}>C: {item.comment}</div>}
                      {item.descuento && <div style={{ color: C.purple, fontSize: 12, paddingLeft: 12 }}>Desc. {item.descuento.pct}% −${item.descuento.monto.toFixed(0)} · {item.descuento.nombre}</div>}
                    </div>
                  ))}
                </div>
                {ei < cuenta.envios.length - 1 && <div style={{ borderTop: `1px solid #2a2a2a`, margin: "8px 0" }} />}
              </div>
            ))}
            {cuenta.descuentoCuenta && (
              <div style={{ background: "#1e1e1e", borderRadius: 12, padding: 12, marginTop: 8, border: `1px solid ${C.purple}` }}>
                <div style={{ color: C.purple, fontSize: 13, fontWeight: 700 }}>Descuento a toda la cuenta: −{cuenta.descuentoCuenta.pct}%</div>
                <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>Autoriza: {cuenta.descuentoCuenta.nombre} · {cuenta.descuentoCuenta.motivo}</div>
              </div>
            )}
          </>}
      </div>

      {/* Bottom bar */}
      <div style={{ background: C.card, borderTop: `2px solid ${C.border}`, padding: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontSize: 13, color: C.muted }}>
            Bruta: <span style={{ color: "#fff" }}>${bruta.toFixed(0)}</span>
            {totalDescMonto > 0 && <span style={{ color: C.purple, marginLeft: 8 }}>−${totalDescMonto.toFixed(0)}</span>}
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color: C.gold }}>Total: ${neta.toFixed(0)}</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          <button style={{ ...btn(C.green), padding: "12px 0", fontSize: 13, borderRadius: 10 }}
            onClick={() => { if (allSentItems.length === 0) return alert("Sin productos enviados"); setCobrarModal(true); }}>
            💰 Cobrar
          </button>
          <button style={{ ...btn(C.purple), padding: "12px 0", fontSize: 13, borderRadius: 10 }}
            onClick={() => setDescuentoModal(true)}>% Desc.</button>
          <button style={{ ...btn("#444"), padding: "12px 0", fontSize: 13, borderRadius: 10 }}
            onClick={() => { if (allSentItems.length === 0) return alert("Sin productos para eliminar"); setEliminarModal(true); }}>🗑️ Eliminar</button>
        </div>
      </div>

      {/* Modals */}
      {tortaModal    && <TortaQuesoModal  item={tortaModal}  onConfirm={i => { addPending(i); setTortaModal(null); }}  onClose={() => setTortaModal(null)} />}
      {promoModal    && <PromoBebidaModal item={promoModal}  onConfirm={i => { addPending(i); setPromoModal(null); }}  onClose={() => setPromoModal(null)} />}
      {commentModal  && <CommentProductModal item={commentModal.item}
        onConfirm={text => { setPendingItems(prev => prev.map((it, i) => i === commentModal.idx ? { ...it, comment: text } : it)); setCommentModal(null); }}
        onClose={() => setCommentModal(null)} />}
      {descuentoModal && <DescuentoModal cuenta={cuenta} employees={employees}
        onConfirm={data => { onDescuento(data); setDescuentoModal(false); }}
        onClose={() => setDescuentoModal(false)} />}
      {cobrarModal   && <CobrarModal   cuenta={cuenta} onConfirm={p => { setCobrarModal(false);   onCobrar(p);   }} onClose={() => setCobrarModal(false)} />}
      {eliminarModal && <EliminarProductosModal cuenta={cuenta} employees={employees}
        onConfirm={data => { setEliminarModal(false); onEliminarProductos(data); }}
        onClose={() => setEliminarModal(false)} />}
    </div>
  );
}

// ─── DELETE PIN MODAL ────────────────────────────────────────────────────────
function DeletePinModal({ target, employees, onConfirm, onClose }) {
  const [pin, setPin] = useState("");
  const handlePin = () => {
    if (employees.find(e => e.pin === pin && e.isOwner)) onConfirm();
    else { setPin(""); alert("PIN de dueño incorrecto"); }
  };
  return (
    <div style={overlay}><div style={mbox()}>
      <div style={mTitle()}>Eliminar {target.kind === "section" ? "sección" : "producto"}</div>
      <div style={{ fontSize: 14, color: "#fff", textAlign: "center", marginBottom: 4 }}>"{target.label}"</div>
      <div style={{ fontSize: 12, color: C.muted, textAlign: "center", marginBottom: 16 }}>
        {target.kind === "section" ? "Se borrará la sección y todos sus productos." : "Esta acción no se puede deshacer."}
      </div>
      <div style={{ fontSize: 13, color: C.muted, textAlign: "center", marginBottom: 10 }}>Confirma con PIN de dueño</div>
      <NumPad value={pin} onChange={setPin} onEnter={handlePin} />
      <button style={cancelBtn} onClick={onClose}>Cancelar</button>
    </div></div>
  );
}

// ─── OWNER PANEL ─────────────────────────────────────────────────────────────
function OwnerPanel({ logs, employees, setEmployees, menu, setMenu, cuentas, todayKey, onBack }) {
  const [tab, setTab]               = useState("resumen");
  // Date filter: picked ISO date in the input, activeDate applied on Buscar
  const [pickedDate,  setPickedDate]  = useState(todayISO());
  const [activeDate,  setActiveDate]  = useState(todayStr()); // ISO key used in logs
  const [newName,     setNewName]     = useState("");
  const [newPin,      setNewPin]      = useState("");
  const [newSeccion,  setNewSeccion]  = useState("");
  const [selSeccion,  setSelSeccion]  = useState(menu[0]?.id || "");
  const [newProduct,  setNewProduct]  = useState({ name: "", price: "" });
  // Menu editing
  const [editSeccion, setEditSeccion] = useState(null); // {id, label}
  const [editProduct, setEditProduct] = useState(null); // {secId, id, name, price}
  // Delete confirmation with owner PIN: {kind:'product'|'section', secId, id, label}
  const [deleteTarget, setDeleteTarget] = useState(null);

  const handleBuscar = () => setActiveDate(pickedDate);

  // Pending (uncobradas) accounts across ALL users — live
  const pendientes = (cuentas || [])
    .filter(c => c.date === todayKey)
    .sort((a, b) => a.num - b.num);
  const pendienteTotal = pendientes.reduce((s, c) => s + cuentaNeta(c), 0);

  const dayOrders  = logs.filter(l => l.type === "cobro"       && l.date === activeDate);
  const dayCancels = logs.filter(l => l.type === "cancel"      && l.date === activeDate);
  const dayDescs   = logs.filter(l => l.type === "descuento"   && l.date === activeDate);
  const dayElims   = logs.filter(l => l.type === "eliminacion" && l.date === activeDate);
  const elimCount  = dayElims.reduce((s, l) => s + (l.items || []).reduce((a, i) => a + i.qty, 0), 0);

  const bruta         = dayOrders.reduce((s, o) => s + o.bruta, 0);
  const neta          = dayOrders.reduce((s, o) => s + o.neta,  0);
  const propinas      = dayOrders.reduce((s, o) => s + (o.pago?.propina || 0), 0);
  const efectivo      = dayOrders.reduce((s, o) => s + (o.pago?.efectivo || 0), 0);
  const tarjeta       = dayOrders.reduce((s, o) => s + (o.pago?.tarjeta || 0), 0);
  const transferencia = dayOrders.reduce((s, o) => s + (o.pago?.transferencia || 0), 0);

  const productStats = {};
  dayOrders.forEach(o => (o.items || []).forEach(i => {
    if (!productStats[i.name]) productStats[i.name] = { qty: 0, total: 0 };
    productStats[i.name].qty   += i.qty;
    productStats[i.name].total += i.price * i.qty;
  }));

  // Movements filtered to activeDate (resumen + productos use it; movimientos shows all but highlighted)
  const dayLogs = logs.filter(l => l.date === activeDate);

  const Stat = ({ label, value, color }) => (
    <div style={{ background: C.card2, borderRadius: 12, padding: 14 }}>
      <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: color || C.gold }}>{value}</div>
    </div>
  );

  // Shared date picker row used by all tabs
  const DatePicker = () => (
    <div style={{ display: "flex", gap: 8, marginBottom: 14, alignItems: "center" }}>
      <input
        type="date"
        style={{ ...inp, marginBottom: 0, flex: 1, cursor: "pointer", colorScheme: "dark" }}
        value={pickedDate}
        onChange={e => setPickedDate(e.target.value)}
        onClick={e => { try { e.target.showPicker && e.target.showPicker(); } catch (_) {} }}
        onFocus={e => { try { e.target.showPicker && e.target.showPicker(); } catch (_) {} }}
      />
      <button style={{ ...btn(C.red), padding: "10px 18px", fontSize: 14, borderRadius: 10, whiteSpace: "nowrap" }} onClick={handleBuscar}>
        Buscar
      </button>
    </div>
  );

  return (
    <div style={{ fontFamily: "'Inter',sans-serif", background: "#0d0d0d", minHeight: "100vh", color: "#fff", maxWidth: 480, margin: "0 auto", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", background: C.card, borderBottom: `2px solid ${C.red}` }}>
        <button style={{ ...btn(C.card2), padding: "6px 12px", fontSize: 13, borderRadius: 8 }} onClick={onBack}>← Salir</button>
        <div style={{ fontWeight: 800, fontSize: 16 }}>Panel Dueño</div>
        <div style={{ fontSize: 12, color: C.muted }}>{prettyDate(activeDate)}</div>
      </div>

      <div style={{ display: "flex", overflowX: "auto", gap: 8, padding: "10px 16px", background: "#161616" }}>
        {["resumen","productos","movimientos","empleados","menu"].map(t => (
          <button key={t} style={{ ...btn(tab === t ? C.red : "#2a2a2a"), padding: "8px 14px", fontSize: 12, borderRadius: 10, whiteSpace: "nowrap" }}
            onClick={() => setTab(t)}>{t.charAt(0).toUpperCase() + t.slice(1)}</button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>

        {tab === "resumen" && <>
          <DatePicker />

          {/* Pendientes en tiempo real (solo del día de hoy) */}
          {activeDate === todayKey && (
            <div style={{ background: C.card, borderRadius: 14, padding: 14, marginBottom: 14, border: `2px solid ${C.gold}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: pendientes.length ? 10 : 0 }}>
                <div style={{ fontWeight: 800, color: C.gold, fontSize: 15 }}>⏳ Pendiente por cobrar</div>
                <div style={{ fontSize: 12, color: C.muted }}>{pendientes.length} cuenta{pendientes.length === 1 ? "" : "s"}</div>
              </div>
              {pendientes.length > 0 && <>
                <div style={{ fontSize: 26, fontWeight: 900, color: C.gold, marginBottom: 10 }}>${pendienteTotal.toFixed(0)}</div>
                {pendientes.map(c => {
                  const t = cuentaNeta(c);
                  return (
                    <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: `1px solid #2a2a2a`, fontSize: 13 }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <b style={{ color: C.gold }}>Cuenta {pad(c.num)}</b>
                        <span style={{ background: C.gold, color: "#111", fontSize: 10, fontWeight: 800, borderRadius: 4, padding: "1px 5px" }}>PENDIENTE</span>
                      </span>
                      <span style={{ color: C.muted }}>{c.abiertaPor}</span>
                      <span style={{ color: "#fff", fontWeight: 700 }}>${t.toFixed(0)}</span>
                    </div>
                  );
                })}
              </>}
              {pendientes.length === 0 && <div style={{ fontSize: 13, color: C.muted, marginTop: 8 }}>No hay cuentas pendientes</div>}
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
            <Stat label="Venta Bruta"      value={`$${bruta.toFixed(0)}`}         color={C.red} />
            <Stat label="Venta Neta"       value={`$${neta.toFixed(0)}`}          color={C.green} />
            <Stat label="Efectivo"         value={`$${efectivo.toFixed(0)}`}      color={C.blue} />
            <Stat label="Tarjeta"          value={`$${tarjeta.toFixed(0)}`}       color={C.purple} />
            <Stat label="Transferencia"    value={`$${transferencia.toFixed(0)}`} color={C.orange} />
            <Stat label="Propinas"         value={`$${propinas.toFixed(0)}`}      color={C.gold} />
            <Stat label="Cuentas cobradas" value={dayOrders.length}               color="#fff" />
            <Stat label="Cancelaciones"    value={dayCancels.length}              color={C.red} />
            <Stat label="Prod. eliminados" value={elimCount}                      color={C.orange} />
          </div>
          {dayCancels.length > 0 && (
            <div style={{ background: C.card, borderRadius: 14, padding: 14, marginBottom: 12, border: `1px solid ${C.border}` }}>
              <div style={{ fontWeight: 700, color: C.red, marginBottom: 8 }}>Cancelaciones</div>
              {dayCancels.map((l, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid #2a2a2a`, fontSize: 13 }}>
                  <span>Cuenta {pad(l.cuentaNum)}</span>
                  <span style={{ color: C.muted }}>{l.by}</span>
                  <span style={{ color: C.red, fontSize: 12 }}>{l.motivo}</span>
                </div>
              ))}
            </div>
          )}
          {dayDescs.length > 0 && (
            <div style={{ background: C.card, borderRadius: 14, padding: 14, border: `1px solid ${C.border}` }}>
              <div style={{ fontWeight: 700, color: C.purple, marginBottom: 8 }}>Cortesías / Descuentos</div>
              {dayDescs.map((l, i) => (
                <div key={i} style={{ padding: "8px 0", borderBottom: `1px solid #2a2a2a`, fontSize: 13 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span><b>Cuenta {pad(l.cuentaNum)}</b></span>
                    <span style={{ color: C.muted, fontSize: 12 }}>{l.time}</span>
                  </div>
                  <div style={{ color: C.purple, fontSize: 12, marginTop: 2 }}>
                    {l.scope === "cuenta"
                      ? `Toda la cuenta −${l.globalPct}% (−$${l.monto?.toFixed(0)})`
                      : l.items?.map(it => `${it.qty}×${it.name} −${it.descPct}%`).join(", ")}
                  </div>
                  <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>Motivo: {l.motivo} · Autoriza: {l.nombre}</div>
                </div>
              ))}
            </div>
          )}
          {dayElims.length > 0 && (
            <div style={{ background: C.card, borderRadius: 14, padding: 14, marginTop: 12, border: `1px solid ${C.border}` }}>
              <div style={{ fontWeight: 700, color: C.orange, marginBottom: 8 }}>Productos eliminados</div>
              {dayElims.map((l, i) => (
                <div key={i} style={{ padding: "8px 0", borderBottom: `1px solid #2a2a2a`, fontSize: 13 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span><b>Cuenta {pad(l.cuentaNum)}</b></span>
                    <span style={{ color: C.muted, fontSize: 12 }}>{l.time}</span>
                  </div>
                  <div style={{ color: C.orange, fontSize: 12, marginTop: 2 }}>{l.items.map(it => `${it.qty}×${it.name}`).join(", ")}</div>
                  <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>Motivo: {l.motivo} · Autoriza: {l.nombre}</div>
                </div>
              ))}
            </div>
          )}
        </>}

        {tab === "productos" && <>
          <DatePicker />
          <div style={{ background: C.card, borderRadius: 14, padding: 14, border: `1px solid ${C.border}` }}>
            <div style={{ fontWeight: 700, color: C.red, marginBottom: 10 }}>Vendido — {prettyDate(activeDate)}</div>
            {Object.keys(productStats).length === 0
              ? <div style={{ color: "#555", fontSize: 13 }}>Sin ventas este día</div>
              : Object.entries(productStats).sort((a, b) => b[1].qty - a[1].qty).map(([name, s]) => (
                <div key={name} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid #2a2a2a`, fontSize: 13 }}>
                  <span style={{ flex: 1 }}>{name}</span>
                  <span style={{ color: C.orange, marginRight: 12 }}>{s.qty} pzs</span>
                  <span style={{ color: C.gold }}>${s.total}</span>
                </div>
              ))}
          </div>
          {dayElims.length > 0 && (
            <div style={{ background: C.card, borderRadius: 14, padding: 14, marginTop: 12, border: `1px solid ${C.border}` }}>
              <div style={{ fontWeight: 700, color: C.orange, marginBottom: 10 }}>Productos eliminados — {prettyDate(activeDate)}</div>
              {(() => {
                const elimStats = {};
                dayElims.forEach(l => l.items.forEach(i => { elimStats[i.name] = (elimStats[i.name] || 0) + i.qty; }));
                return Object.entries(elimStats).sort((a, b) => b[1] - a[1]).map(([name, qty]) => (
                  <div key={name} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid #2a2a2a`, fontSize: 13 }}>
                    <span style={{ flex: 1 }}>{name}</span>
                    <span style={{ color: C.orange }}>{qty} pzs</span>
                  </div>
                ));
              })()}
            </div>
          )}
        </>}

        {tab === "movimientos" && <>
          <DatePicker />

          {/* Cuentas pendientes en tiempo real de TODOS los usuarios */}
          {activeDate === todayKey && pendientes.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 700, color: C.gold, marginBottom: 10 }}>⏳ En curso ahora ({pendientes.length})</div>
              {pendientes.map(c => {
                const items = c.envios.flatMap(e => e.items);
                const total = cuentaNeta(c);
                return (
                  <div key={c.id} style={{ background: C.card, borderRadius: 14, padding: 14, marginBottom: 10, border: `2px solid ${C.gold}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{ background: C.gold, color: "#111", borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 800 }}>PENDIENTE</span>
                      <span style={{ fontSize: 12, color: C.muted }}>Abierta {c.horaAbierta}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 800, color: C.gold }}>Cuenta {pad(c.num)}</div>
                        <div style={{ fontSize: 12, color: C.muted }}>{c.abiertaPor} · {c.tipo}{c.comentario ? ` · ${c.comentario}` : ""}</div>
                      </div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: "#fff" }}>${total.toFixed(0)}</div>
                    </div>
                    {items.length > 0 && <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>{items.map(i => `${i.qty}×${i.name}`).join(", ")}</div>}
                    {items.length === 0 && <div style={{ fontSize: 12, color: "#555", marginTop: 6 }}>Aún sin productos enviados</div>}
                  </div>
                );
              })}
              <div style={{ borderTop: `1px solid ${C.border}`, margin: "4px 0 12px" }} />
            </div>
          )}

          <div style={{ fontWeight: 700, color: C.red, marginBottom: 12 }}>Movimientos — {prettyDate(activeDate)}</div>
          {dayLogs.length === 0
            ? <div style={{ color: "#555", fontSize: 13 }}>Sin movimientos este día</div>
            : [...dayLogs].reverse().map((l, i) => (
              <div key={i} style={{ background: C.card, borderRadius: 14, padding: 14, marginBottom: 10, border: `1px solid ${C.border}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ background: l.type === "cobro" ? C.green : l.type === "cancel" ? C.red : l.type === "eliminacion" ? C.orange : C.purple, borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700, color: l.type === "eliminacion" ? "#111" : "#fff" }}>{l.type}</span>
                  <span style={{ fontSize: 12, color: C.muted }}>{l.time}</span>
                </div>
                <div style={{ fontSize: 13 }}>Cuenta {pad(l.cuentaNum)} · <span style={{ color: C.muted }}>{l.by}</span></div>
                {l.type === "eliminacion" && <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>Autoriza: {l.nombre}</div>}
                {l.motivo && <div style={{ fontSize: 12, color: l.type === "eliminacion" ? C.orange : C.red,    marginTop: 4 }}>Motivo: {l.motivo}</div>}
                {l.type === "descuento" && <div style={{ fontSize: 12, color: C.purple, marginTop: 4 }}>
                  {l.scope === "cuenta" ? `Toda la cuenta −${l.globalPct}% (−$${l.monto?.toFixed(0)})` : l.items?.map(it => `${it.qty}×${it.name} −${it.descPct}%`).join(", ")} · {l.nombre}
                </div>}
                {l.neta   && <div style={{ fontSize: 13, color: C.gold,   marginTop: 4 }}>Neto: ${l.neta.toFixed(0)} · {l.pago?.metodo}</div>}
                {l.items  && <div style={{ fontSize: 12, color: C.muted,  marginTop: 4 }}>{l.items.map(i => `${i.name}×${i.qty}`).join(", ")}</div>}
              </div>
            ))}
        </>}

        {tab === "empleados" && <>
          <div style={{ fontWeight: 700, color: C.red, marginBottom: 12 }}>Empleados</div>
          {employees.map(e => (
            <div key={e.id} style={{ background: C.card, borderRadius: 14, padding: 14, marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center", border: `1px solid ${C.border}` }}>
              <div>
                <div style={{ fontWeight: 700 }}>{e.name}</div>
                <div style={{ fontSize: 12, color: C.muted }}>PIN: {e.pin} {e.isOwner && <span style={{ background: C.red, borderRadius: 6, padding: "1px 6px", fontSize: 10, marginLeft: 4 }}>Dueño</span>}</div>
              </div>
              {!e.isOwner && (
                <button style={{ ...btn(C.darkRed), padding: "6px 12px", fontSize: 12, borderRadius: 8 }}
                  onClick={() => setEmployees(prev => prev.filter(x => x.id !== e.id))}>Eliminar</button>
              )}
            </div>
          ))}
          <div style={{ background: C.card, borderRadius: 14, padding: 14, border: `1px solid ${C.border}` }}>
            <div style={{ fontWeight: 700, color: C.green, marginBottom: 10 }}>Agregar empleado</div>
            <input style={inp} placeholder="Nombre" value={newName} onChange={e => setNewName(e.target.value)} />
            <input style={inp} type="number" placeholder="PIN (4-6 dígitos)" value={newPin} onChange={e => setNewPin(e.target.value)} />
            <button style={{ ...btn(C.green), padding: "12px 0", fontSize: 14, width: "100%", borderRadius: 12 }}
              onClick={() => {
                if (!newName.trim() || !newPin.trim()) return alert("Completa nombre y PIN");
                if (employees.find(e => e.pin === newPin)) return alert("Ese PIN ya existe");
                setEmployees(prev => [...prev, { id: String(Date.now()), name: newName.trim(), pin: newPin.trim(), isOwner: false }]);
                setNewName(""); setNewPin("");
              }}>Agregar</button>
          </div>
        </>}

        {tab === "menu" && <>
          <div style={{ fontWeight: 700, color: C.red, marginBottom: 12 }}>Gestión de Menú</div>
          {menu.map(sec => (
            <div key={sec.id} style={{ background: C.card, borderRadius: 14, padding: 14, marginBottom: 10, border: `1px solid ${C.border}` }}>
              {/* Section header with edit + delete */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                {editSeccion?.id === sec.id ? (
                  <div style={{ display: "flex", gap: 6, flex: 1 }}>
                    <input style={{ ...inp, marginBottom: 0, flex: 1 }} value={editSeccion.label}
                      onChange={e => setEditSeccion({ ...editSeccion, label: e.target.value })} />
                    <button style={{ ...btn(C.green), padding: "8px 12px", fontSize: 12, borderRadius: 8 }}
                      onClick={() => {
                        if (!editSeccion.label.trim()) return alert("Escribe un nombre");
                        setMenu(prev => prev.map(s => s.id === sec.id ? { ...s, label: editSeccion.label.trim() } : s));
                        setEditSeccion(null);
                      }}>✓</button>
                    <button style={{ ...btn("#444"), padding: "8px 12px", fontSize: 12, borderRadius: 8 }}
                      onClick={() => setEditSeccion(null)}>✕</button>
                  </div>
                ) : (
                  <>
                    <div style={{ fontWeight: 700, color: C.gold, fontSize: 15 }}>{sec.label}</div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button style={{ ...btn(C.card2), padding: "5px 10px", fontSize: 13, borderRadius: 8, border: `1px solid ${C.border}` }}
                        onClick={() => setEditSeccion({ id: sec.id, label: sec.label })}>✏️</button>
                      <button style={{ ...btn(C.darkRed), padding: "5px 10px", fontSize: 13, borderRadius: 8 }}
                        onClick={() => setDeleteTarget({ kind: "section", id: sec.id, label: sec.label })}>🗑️</button>
                    </div>
                  </>
                )}
              </div>

              {/* Products */}
              {sec.items.map(item => (
                <div key={item.id} style={{ padding: "8px 0", borderBottom: `1px solid #2a2a2a` }}>
                  {editProduct?.id === item.id && editProduct?.secId === sec.id ? (
                    // EDIT MODE
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <input style={{ ...inp, marginBottom: 0 }} value={editProduct.name}
                        onChange={e => setEditProduct({ ...editProduct, name: e.target.value })} placeholder="Nombre" />
                      <div style={{ display: "flex", gap: 6 }}>
                        <input style={{ ...inp, marginBottom: 0, flex: 1 }} type="number" value={editProduct.price}
                          onChange={e => setEditProduct({ ...editProduct, price: e.target.value })} placeholder="Precio"
                          disabled={item.hasQueso} />
                        <button style={{ ...btn(C.green), padding: "8px 14px", fontSize: 13, borderRadius: 8 }}
                          onClick={() => {
                            if (!editProduct.name.trim()) return alert("Escribe un nombre");
                            setMenu(prev => prev.map(s => s.id === sec.id ? {
                              ...s, items: s.items.map(i => i.id === item.id
                                ? { ...i, name: editProduct.name.trim(), price: item.hasQueso ? i.price : Number(editProduct.price) }
                                : i)
                            } : s));
                            setEditProduct(null);
                          }}>✓</button>
                        <button style={{ ...btn("#444"), padding: "8px 14px", fontSize: 13, borderRadius: 8 }}
                          onClick={() => setEditProduct(null)}>✕</button>
                      </div>
                      {item.hasQueso && <div style={{ fontSize: 11, color: C.muted }}>Las tortas tienen precio fijo $85/$95</div>}
                    </div>
                  ) : (
                    // VIEW MODE
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
                      <span style={{ flex: 1, fontSize: 13, opacity: item.active === false ? 0.4 : 1, textDecoration: item.active === false ? "line-through" : "none" }}>{item.name}</span>
                      <span style={{ color: C.gold, fontSize: 13 }}>{item.hasQueso ? "$85/$95" : `$${item.price}`}</span>
                      <button style={{ ...btn(C.card2), padding: "4px 8px", fontSize: 12, borderRadius: 8, border: `1px solid ${C.border}` }}
                        onClick={() => setEditProduct({ secId: sec.id, id: item.id, name: item.name, price: item.price })}>✏️</button>
                      <button style={{ ...btn(item.active === false ? "#555" : "#3a3a3a"), padding: "4px 8px", fontSize: 11, borderRadius: 8 }}
                        onClick={() => setMenu(prev => prev.map(s => s.id === sec.id ? { ...s, items: s.items.map(i => i.id === item.id ? { ...i, active: i.active === false ? true : false } : i) } : s))}>
                        {item.active === false ? "🔴" : "🟢"}
                      </button>
                      <button style={{ ...btn(C.darkRed), padding: "4px 8px", fontSize: 12, borderRadius: 8 }}
                        onClick={() => setDeleteTarget({ kind: "product", secId: sec.id, id: item.id, label: item.name })}>🗑️</button>
                    </div>
                  )}
                </div>
              ))}
              {sec.items.length === 0 && <div style={{ fontSize: 12, color: "#555", padding: "8px 0" }}>Sin productos en esta sección</div>}
            </div>
          ))}

          <div style={{ fontSize: 11, color: C.muted, marginBottom: 12, padding: "0 4px" }}>
            ✏️ editar · 🟢/🔴 activar o desactivar tecla · 🗑️ eliminar
          </div>

          <div style={{ background: C.card, borderRadius: 14, padding: 14, marginBottom: 10, border: `1px solid ${C.border}` }}>
            <div style={{ fontWeight: 700, color: C.green, marginBottom: 10 }}>Agregar producto</div>
            <select style={{ ...inp }} value={selSeccion} onChange={e => setSelSeccion(e.target.value)}>
              {menu.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
            <input style={inp} placeholder="Nombre del producto" value={newProduct.name} onChange={e => setNewProduct(p => ({ ...p, name: e.target.value }))} />
            <input style={inp} type="number" placeholder="Precio $" value={newProduct.price} onChange={e => setNewProduct(p => ({ ...p, price: e.target.value }))} />
            <button style={{ ...btn(C.green), padding: "12px 0", fontSize: 14, width: "100%", borderRadius: 12 }}
              onClick={() => {
                if (!newProduct.name.trim() || !newProduct.price) return alert("Completa los campos");
                setMenu(prev => prev.map(s => s.id === selSeccion ? { ...s, items: [...s.items, { id: "custom_" + Date.now(), name: newProduct.name.trim(), price: Number(newProduct.price), active: true }] } : s));
                setNewProduct({ name: "", price: "" });
              }}>Agregar producto</button>
          </div>

          <div style={{ background: C.card, borderRadius: 14, padding: 14, border: `1px solid ${C.border}` }}>
            <div style={{ fontWeight: 700, color: C.blue, marginBottom: 10 }}>Agregar nueva sección</div>
            <input style={inp} placeholder="Ej. Postres" value={newSeccion} onChange={e => setNewSeccion(e.target.value)} />
            <button style={{ ...btn(C.blue), padding: "12px 0", fontSize: 14, width: "100%", borderRadius: 12 }}
              onClick={() => {
                if (!newSeccion.trim()) return alert("Escribe el nombre");
                setMenu(prev => [...prev, { id: "sec_" + Date.now(), label: newSeccion.trim(), color: "#555", items: [] }]);
                setNewSeccion("");
              }}>Agregar sección</button>
          </div>
        </>}
      </div>

      {deleteTarget && (
        <DeletePinModal
          target={deleteTarget}
          employees={employees}
          onConfirm={() => {
            if (deleteTarget.kind === "section") {
              setMenu(prev => prev.filter(s => s.id !== deleteTarget.id));
            } else {
              setMenu(prev => prev.map(s => s.id === deleteTarget.secId
                ? { ...s, items: s.items.filter(i => i.id !== deleteTarget.id) }
                : s));
            }
            setDeleteTarget(null);
          }}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
// ─── ROOT ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [screen,        setScreen]        = useState("login");
  const [currentUser,   setCurrentUser]   = useState(null);
  const [employees,     setEmployees]     = useState([]);
  const [menu,          setMenu]          = useState([]);
  const [logs,          setLogs]          = useState([]);
  const [cuentas,       setCuentas]       = useState([]);
  const [selectedCuenta,setSelectedCuenta]= useState(null);
  const [pin,           setPin]           = useState("");
  const [abrirModal,    setAbrirModal]    = useState(false);
  const [loading,       setLoading]       = useState(true);

  // ── Real-time sync with Firestore. Each collection mirrors into local state
  // automatically whenever ANY device writes to it — that's how every tablet
  // and phone stays in sync live.
  useEffect(() => {
    let ready = { e: false, m: false, l: false, c: false };
    const checkReady = () => { if (Object.values(ready).every(Boolean)) setLoading(false); };

    const unsubEmployees = onSnapshot(employeesCol, async (snap) => {
      if (snap.empty) {
        // First run ever: seed default employees into Firestore
        for (const emp of INITIAL_EMPLOYEES) {
          await setDoc(doc(employeesCol, String(emp.id)), emp);
        }
      } else {
        setEmployees(snap.docs.map(d => d.data()));
      }
      ready.e = true; checkReady();
    });

    const unsubMenu = onSnapshot(menuCol, async (snap) => {
      if (snap.empty) {
        // First run ever: seed default menu into Firestore
        for (const sec of INITIAL_MENU) {
          await setDoc(doc(menuCol, sec.id), sec);
        }
      } else {
        setMenu(snap.docs.map(d => d.data()));
      }
      ready.m = true; checkReady();
    });

    const unsubLogs = onSnapshot(logsCol, (snap) => {
      setLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      ready.l = true; checkReady();
    });

    const unsubCuentas = onSnapshot(cuentasCol, (snap) => {
      setCuentas(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      ready.c = true; checkReady();
    });

    return () => { unsubEmployees(); unsubMenu(); unsubLogs(); unsubCuentas(); };
  }, []);

  // Keep selectedCuenta pointing at the live version as cuentas update from Firestore
  useEffect(() => {
    if (!selectedCuenta) return;
    const fresh = cuentas.find(c => c.id === selectedCuenta.id);
    if (fresh) setSelectedCuenta(fresh);
    else if (screen === "cuenta_detail") { setSelectedCuenta(null); setScreen("cuentas"); }
  }, [cuentas]);

  // ── Firestore write helpers used throughout the app ──────────────────────
  // Firestore rejects `undefined` values, so we strip them before every write.
  const clean = (obj) => JSON.parse(JSON.stringify(obj, (k, v) => v === undefined ? null : v));
  const fsAddCuenta = async (cuenta) => { await setDoc(doc(cuentasCol, String(cuenta.id)), clean(cuenta)); };
  const fsUpdateCuenta = async (cuenta) => { await setDoc(doc(cuentasCol, String(cuenta.id)), clean(cuenta)); };
  const fsRemoveCuenta = async (id) => { await deleteDoc(doc(cuentasCol, String(id))); };
  const fsAddLog = async (log) => { await setDoc(doc(logsCol, String(Date.now()) + Math.random().toString(36).slice(2)), clean(log)); };
  const fsSetEmployees = async (next) => {
    // Diff against current employees: write changed/new, delete removed
    const nextIds = new Set(next.map(e => String(e.id)));
    for (const e of next) await setDoc(doc(employeesCol, String(e.id)), clean(e));
    for (const e of employees) if (!nextIds.has(String(e.id))) await deleteDoc(doc(employeesCol, String(e.id)));
  };
  const fsSetMenu = async (next) => {
    const nextIds = new Set(next.map(s => s.id));
    for (const sec of next) await setDoc(doc(menuCol, sec.id), clean(sec));
    for (const sec of menu) if (!nextIds.has(sec.id)) await deleteDoc(doc(menuCol, sec.id));
  };

  // setEmployees / setMenu used elsewhere in this file are wrapped so the rest
  // of the app's code (which calls setEmployees(prev => ...) etc.) keeps working
  // unchanged, while also pushing the result to Firestore.
  const setEmployeesSynced = (updater) => {
    setEmployees(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      fsSetEmployees(next);
      return next;
    });
  };
  const setMenuSynced = (updater) => {
    setMenu(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      fsSetMenu(next);
      return next;
    });
  };

  // ── Global next account number: highest number across ALL cuentas today + 1
  const todayCuentas = cuentas.filter(c => c.date === todayStr());
  const maxNum       = todayCuentas.length > 0 ? Math.max(...todayCuentas.map(c => c.num)) : 0;
  // Also check logs (paid accounts that are no longer in cuentas)
  const todayLogs    = logs.filter(l => l.date === todayStr() && l.cuentaNum);
  const maxLogNum    = todayLogs.length > 0 ? Math.max(...todayLogs.map(l => l.cuentaNum)) : 0;
  const nextNum      = Math.max(maxNum, maxLogNum) + 1;

  const handleLogin = () => {
    const emp = employees.find(e => e.pin === pin);
    if (!emp) { setPin(""); return alert("PIN incorrecto"); }
    setCurrentUser(emp);
    setPin("");
    setScreen(emp.isOwner ? "owner" : "cuentas");
  };

  const handleAbrirCuenta = (tipo, comentario) => {
    const nueva = {
      id: String(Date.now()), num: nextNum, date: todayStr(),
      tipo, comentario, abiertaPor: currentUser.name, userId: currentUser.id,
      horaAbierta: nowStr(), envios: [], discountPct: 0, discountInfo: null,
    };
    setSelectedCuenta(nueva);
    setScreen("cuenta_detail");
    setAbrirModal(false);
    fsAddCuenta(nueva);
  };

  const handleUpdateCuenta = (updated) => {
    setSelectedCuenta(updated);
    fsUpdateCuenta(updated);
  };

  const handleCobrar = (pago) => {
    const cuenta   = selectedCuenta;
    const allItems = cuenta.envios.flatMap(e => e.items);
    const bruta    = calcBruta(allItems);
    const neta     = cuentaNeta(cuenta);
    setSelectedCuenta(null);
    setScreen("cuentas");
    fsAddLog({ type: "cobro", date: todayStr(), time: nowStr(), cuentaNum: cuenta.num, by: currentUser.name, items: allItems, bruta, neta, pago });
    fsRemoveCuenta(cuenta.id);
  };

  const handleDescuento = (data) => {
    const cuenta = selectedCuenta;
    const { mode, motivo, nombre } = data;

    if (mode === "cuenta") {
      // Whole-account discount: store as account-level field
      const bruta = calcBruta(cuenta.envios.flatMap(e => e.items));
      const monto = bruta * data.globalPct / 100;
      const updated = { ...cuenta, descuentoCuenta: { pct: data.globalPct, monto, nombre, motivo } };
      setSelectedCuenta(updated);
      fsUpdateCuenta(updated);
      fsAddLog({
        type: "descuento", date: todayStr(), time: nowStr(),
        cuentaNum: cuenta.num, by: currentUser.name,
        scope: "cuenta", globalPct: data.globalPct, monto, motivo, nombre,
      });
      return;
    }

    // Per-product: may apply to only some pieces → split the line
    const { lines } = data;
    const newEnvios = cuenta.envios.map(e => {
      const newItems = [];
      e.items.forEach((item, idx) => {
        const d = lines.find(l => l.envioId === e.id && l.idx === idx);
        if (!d) { newItems.push(item); return; }
        const descQty = d.qty;        // pieces getting the discount
        const restQty = item.qty - descQty;
        const descMonto = (item.price * descQty) * d.pct / 100;
        // discounted portion
        newItems.push({ ...item, qty: descQty, descuento: { pct: d.pct, monto: descMonto, nombre, motivo } });
        // remaining portion at full price (if any) — strip any descuento field
        if (restQty > 0) { const { descuento, ...rest } = item; newItems.push({ ...rest, qty: restQty }); }
      });
      return { ...e, items: newItems };
    });
    const updated = { ...cuenta, envios: newEnvios };
    setSelectedCuenta(updated);
    fsUpdateCuenta(updated);

    const logItems = lines.map(l => ({ ...l.item, qty: l.qty, descPct: l.pct, descMonto: (l.item.price * l.qty) * l.pct / 100 }));
    fsAddLog({
      type: "descuento", date: todayStr(), time: nowStr(),
      cuentaNum: cuenta.num, by: currentUser.name,
      scope: "producto", items: logItems, motivo, nombre,
    });
  };

  const handleEliminarProductos = ({ lines, motivo, nombre }) => {
    const cuenta = selectedCuenta;
    const removedItems = lines.map(l => ({ ...l.item, qty: l.removeQty }));

    let newEnvios = cuenta.envios.map(e => {
      const removalsForEnvio = lines.filter(l => l.envioId === e.id);
      if (removalsForEnvio.length === 0) return e;
      const newItems = e.items.map((item, idx) => {
        const r = removalsForEnvio.find(l => l.idx === idx);
        if (!r) return item;
        const newQty = item.qty - r.removeQty;
        return newQty > 0 ? { ...item, qty: newQty } : null;
      }).filter(Boolean);
      return { ...e, items: newItems };
    }).filter(e => e.items.length > 0); // drop empty envios

    const updated = { ...cuenta, envios: newEnvios };
    setSelectedCuenta(updated);
    fsUpdateCuenta(updated);

    // Log the elimination for the owner (resumen / productos / movimientos)
    fsAddLog({
      type: "eliminacion", date: todayStr(), time: nowStr(),
      cuentaNum: cuenta.num, by: currentUser.name,
      items: removedItems, motivo, nombre,
    });
  };

  // ── Loading gate: wait for first Firestore sync before showing anything
  if (loading) return (
    <div style={{ fontFamily: "'Inter',sans-serif", background: C.bg, minHeight: "100vh", color: "#fff", maxWidth: 480, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 24, fontWeight: 900, color: C.red }}>🌮 TACOS LA CAMPESTRE</div>
      <div style={{ fontSize: 13, color: C.muted }}>Conectando...</div>
    </div>
  );

  // LOGIN
  if (screen === "login") return (
    <div style={{ fontFamily: "'Inter',sans-serif", background: C.bg, minHeight: "100vh", color: "#fff", maxWidth: 480, margin: "0 auto", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ fontSize: 30, fontWeight: 900, color: C.red, textAlign: "center" }}>🌮 TACOS</div>
      <div style={{ fontSize: 30, fontWeight: 900, color: C.red, textAlign: "center", marginBottom: 4 }}>LA CAMPESTRE</div>
      <div style={{ fontSize: 13, color: C.muted, marginBottom: 32 }}>Sabor Estilo CDMX</div>
      <div style={{ width: "100%", maxWidth: 280 }}>
        <NumPad value={pin} onChange={setPin} onEnter={handleLogin} label="Ingresa tu PIN" />
      </div>
    </div>
  );

  if (screen === "owner") return (
    <OwnerPanel logs={logs} employees={employees} setEmployees={setEmployeesSynced} menu={menu} setMenu={setMenuSynced}
      cuentas={cuentas} todayKey={todayStr()}
      onBack={() => { setScreen("login"); setCurrentUser(null); }} />
  );

  if (screen === "cuenta_detail" && selectedCuenta) return (
    <CuentaDetail cuenta={selectedCuenta} menu={menu} currentUser={currentUser} employees={employees}
      onBack={() => setScreen("cuentas")}
      onUpdate={handleUpdateCuenta}
      onCobrar={handleCobrar}
      onEliminarProductos={handleEliminarProductos}
      onDescuento={handleDescuento} />
  );

  // CUENTAS LIST — each user sees only their own open accounts
  const misCuentas = cuentas.filter(c => c.date === todayStr() && c.userId === currentUser?.id);

  return (
    <div style={{ fontFamily: "'Inter',sans-serif", background: C.bg, minHeight: "100vh", color: "#fff", maxWidth: 480, margin: "0 auto", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: C.card, borderBottom: `2px solid ${C.red}` }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800 }}>La Campestre</div>
          <div style={{ fontSize: 12, color: C.muted }}>👤 {currentUser?.name}</div>
        </div>
        <button style={{ ...btn(C.card2), padding: "7px 14px", fontSize: 13, borderRadius: 10 }}
          onClick={() => { setScreen("login"); setCurrentUser(null); }}>Salir</button>
      </div>

      <div style={{ padding: "14px 16px 0" }}>
        <button style={{ ...btn(C.red), padding: "16px 0", fontSize: 16, width: "100%", borderRadius: 14, marginBottom: 16 }}
          onClick={() => setAbrirModal(true)}>+ Abrir Cuenta</button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "0 16px 16px" }}>
        {misCuentas.length === 0
          ? <div style={{ textAlign: "center", color: "#444", padding: 40, fontSize: 14 }}>No tienes cuentas abiertas</div>
          : misCuentas.map(cuenta => {
            const allItems = cuenta.envios.flatMap(e => e.items);
            const total = cuentaNeta(cuenta);
            return (
              <button key={cuenta.id}
                style={{ ...btn("#1e1e1e"), width: "100%", padding: 16, borderRadius: 14, marginBottom: 10, border: `1px solid ${C.border}`, textAlign: "left", display: "block" }}
                onClick={() => { setSelectedCuenta(cuenta); setScreen("cuenta_detail"); }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: C.gold }}>Cuenta {pad(cuenta.num)}</div>
                    {cuenta.comentario && <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{cuenta.comentario}</div>}
                    <div style={{ fontSize: 12, color: cuenta.tipo === "Para llevar" ? C.blue : C.green, marginTop: 2 }}>
                      {cuenta.tipo === "Para llevar" ? "🥡 Para llevar" : "🍽️ Comer aquí"} · {cuenta.horaAbierta}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 18, fontWeight: 800 }}>${total.toFixed(0)}</div>
                    <div style={{ fontSize: 11, color: C.muted }}>{allItems.reduce((s, i) => s + i.qty, 0)} productos</div>
                  </div>
                </div>
              </button>
            );
          })}
      </div>

      {abrirModal && <AbrirCuentaModal cuentaNum={nextNum} onConfirm={handleAbrirCuenta} onClose={() => setAbrirModal(false)} />}
    </div>
  );
}
