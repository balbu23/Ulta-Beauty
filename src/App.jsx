import { useState } from 'react';
import { supabase } from './supabaseClient';
import { Scanner } from './components/Scanner';
import * as XLSX from 'xlsx';
import { Scan, Plus, FileSpreadsheet, Sparkles, CheckCircle2, PackageCheck } from 'lucide-react';

export default function App() {
  const [scanning, setScanning] = useState(false);
  const [producto, setProducto] = useState(null);
  const [cantidad, setCantidad] = useState(1);
  const [tipoRegistro, setTipoRegistro] = useState('corte_horario');
  const [mensaje, setMensaje] = useState('');

  // Formulario para producto nuevo
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [codigoEscaneado, setCodigoEscaneado] = useState('');
  const [esNuevo, setEsNuevo] = useState(false);

  const handleScan = async (code) => {
    setScanning(false);
    setCodigoEscaneado(code);

    const { data } = await supabase
      .from('productos')
      .select('*')
      .eq('codigo_barras', code)
      .single();

    if (data) {
      setProducto(data);
      setEsNuevo(false);
    } else {
      setProducto(null);
      setEsNuevo(true);
    }
  };

  const crearProducto = async () => {
  if (!nuevoNombre) return;

  const { data, error } = await supabase
    .from('productos')
    .insert([{ codigo_barras: codigoEscaneado, nombre: nuevoNombre }])
    .select()
    .single();

  if (error) {
    alert("Error al guardar en Supabase: " + error.message);
    console.error(error);
    return;
  }

  if (data) {
    setProducto(data);
    setEsNuevo(false);
    setNuevoNombre('');
  }
};

const guardarRegistro = async () => {
    if (!producto) return;

    try {
      const { error } = await supabase
        .from('registros_conteo')
        .insert([{
          producto_id: producto.id,
          cantidad_piso: cantidad,
          tipo_registro: tipoRegistro
        }]);

      if (error) {
        alert("Error al guardar conteo: " + error.message);
        return;
      }

      setMensaje('¡Conteo guardado con éxito!');
      setProducto(null);
      setCantidad(1);
      setTipoRegistro('corte_horario');
      setTimeout(() => setMensaje(''), 3000);

    } catch (err) {
      console.error(err);

      setProducto(null);
    }
  };

  const exportarExcel = async () => {
    const { data } = await supabase
      .from('registros_conteo')
      .select('created_at, cantidad_piso, tipo_registro, productos(nombre, codigo_barras)');

    const datosFormateados = data.map(row => ({
      'Fecha y Hora': new Date(row.created_at).toLocaleString(),
      'Código': row.productos?.codigo_barras || '',
      'Producto': row.productos?.nombre || '',
      'Cantidad en Piso': row.cantidad_piso,
      'Evento': row.tipo_registro
    }));

    const worksheet = XLSX.utils.json_to_sheet(datosFormateados);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Conteos");
    XLSX.writeFile(workbook, `Reporte_Inventario_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-rose-50 via-pink-50/50 to-slate-100 p-4 max-w-md mx-auto text-slate-800 font-sans">
      {/* Encabezado Estilo Beauty */}
      <header className="mb-6 text-center pt-2">
        <div className="inline-flex items-center gap-1.5 px-3.5 py-1 bg-rose-100/80 text-rose-700 rounded-full text-xs font-bold tracking-wide uppercase mb-2 border border-rose-200">
          <Sparkles size={14} /> Ulta Beauty
        </div>
        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Control de Productos</h1>
        <p className="text-xs text-rose-500 font-semibold mt-0.5">Monitoreo y Conteo en Piso de Venta</p>
      </header>

      {/* Alerta de confirmación */}
      {mensaje && (
        <div className="mb-4 p-3.5 bg-emerald-50 border border-emerald-300 text-emerald-800 rounded-2xl flex items-center gap-2 text-sm shadow-sm">
          <CheckCircle2 className="text-emerald-500 shrink-0" size={20} />
          <span className="font-semibold">{mensaje}</span>
        </div>
      )}

      {/* Botón Principal de Escaneo */}
      {!scanning && (
        <button
          onClick={() => setScanning(true)}
          className="w-full bg-gradient-to-r from-rose-500 via-pink-500 to-rose-600 text-white py-4 px-6 rounded-2xl font-bold flex items-center justify-center gap-3 shadow-lg shadow-rose-500/25 active:scale-95 transition-all hover:brightness-105"
        >
          <Scan size={22} /> Escanear Código de Barras
        </button>
      )}

      {/* Visor de Escáner */}
      {scanning && (
        <div className="mb-6 bg-white p-3 rounded-2xl shadow-xl border border-rose-100">
          <Scanner onScanSuccess={handleScan} />
          <button
            onClick={() => setScanning(false)}
            className="w-full mt-3 bg-rose-50 text-rose-600 py-2.5 rounded-xl font-semibold border border-rose-200 hover:bg-rose-100 transition text-sm"
          >
            Cancelar Escaneo
          </button>
        </div>
      )}

      {/* Registrar Nuevo Producto */}
      {esNuevo && (
        <div className="mt-6 bg-white p-5 rounded-2xl shadow-lg border border-amber-200">
          <div className="flex items-center gap-2 mb-2 text-amber-700">
            <PackageCheck size={20} />
            <h2 className="font-bold text-base">Producto Nuevo Detectado</h2>
          </div>
          <p className="text-xs text-slate-400 mb-3 font-mono">Código: {codigoEscaneado}</p>
          <input
            type="text"
            placeholder="Ej. Labial Matte Maybelline Red #5"
            value={nuevoNombre}
            onChange={(e) => setNuevoNombre(e.target.value)}
            className="w-full p-3 border border-slate-200 rounded-xl mb-3 text-sm focus:outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100"
          />
          <button
            onClick={crearProducto}
            className="w-full bg-slate-900 text-white py-3 rounded-xl font-semibold flex items-center justify-center gap-1.5 text-sm shadow hover:bg-slate-800 transition"
          >
            <Plus size={18} /> Registrar y Continuar
          </button>
        </div>
      )}

      {/* Producto Encontrado */}
      {producto && (
        <div className="mt-6 bg-white p-5 rounded-2xl shadow-xl border border-rose-100 space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <span className="text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 bg-rose-100 text-rose-700 rounded-md">Producto Seleccionado</span>
            <h2 className="text-lg font-bold text-slate-900 mt-1">{producto.nombre}</h2>
            <p className="text-xs text-slate-400 font-mono mt-0.5">EAN: {producto.codigo_barras}</p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Tipo de Evento</label>
            <select
              value={tipoRegistro}
              onChange={(e) => setTipoRegistro(e.target.value)}
              className="w-full p-3 border border-slate-200 rounded-xl bg-slate-50 text-sm font-medium focus:outline-none focus:border-rose-400"
            >
              <option value="corte_horario">🕒 Corte Horario (Revisión)</option>
              <option value="reposicion">📦 Reposición desde Almacén</option>
              <option value="inicio_turno">☀️ Inicio de Turno</option>
              <option value="fin_turno">🌙 Fin de Turno</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-2">Cantidad en Piso de Venta</label>
            <div className="flex items-center justify-between bg-rose-50/50 p-2 rounded-xl border border-rose-100">
              <button
                onClick={() => setCantidad(Math.max(0, cantidad - 1))}
                className="w-12 h-12 bg-white text-slate-700 rounded-lg text-2xl font-bold shadow-sm border border-slate-200 active:bg-slate-100 transition"
              >-</button>
              <span className="text-3xl font-black text-rose-600">{cantidad}</span>
              <button
                onClick={() => setCantidad(cantidad + 1)}
                className="w-12 h-12 bg-white text-slate-700 rounded-lg text-2xl font-bold shadow-sm border border-slate-200 active:bg-slate-100 transition"
              >+</button>
            </div>
          </div>
          <button
            onClick={guardarRegistro}
            className="w-full bg-gradient-to-r from-rose-600 to-pink-600 text-white py-3.5 rounded-xl font-bold shadow-md shadow-rose-500/20 active:scale-95 transition"
          >
            Guardar Conteo
          </button>

          {/* Botón para cerrar manualmente la tarjeta */}
          <button
            onClick={() => {
              setProducto(null);
              setCantidad(1);
            }}
            className="w-full bg-slate-100 text-slate-600 py-2.5 rounded-xl font-semibold text-xs border border-slate-200 hover:bg-slate-200 transition mt-2"
          >
            Cerrar sin guardar
          </button>
        </div>
      )}

      {/* Sección de Exportar */}
      <div className="mt-8 pt-5 border-t border-rose-100">
        <button
          onClick={exportarExcel}
          className="w-full bg-slate-900 hover:bg-slate-800 text-white py-3.5 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow transition"
        >
          <FileSpreadsheet size={18} className="text-emerald-400" /> Exportar Reporte a Excel
        </button>
      </div>
    </div>
  );
}