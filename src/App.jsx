import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { Scanner } from './components/Scanner';
import * as XLSX from 'xlsx';
import { Scan, Plus, FileSpreadsheet, Sparkles, CheckCircle2, PackageCheck, ShoppingBag, ChevronDown, ChevronUp } from 'lucide-react';

export default function App() {
  const [scanning, setScanning] = useState(false);
  const [producto, setProducto] = useState(null);
  const [cantidad, setCantidad] = useState(1);
  const [tipoRegistro, setTipoRegistro] = useState('corte_horario');
  const [mensaje, setMensaje] = useState('');
  const [totalHoy, setTotalHoy] = useState(0);

  // Estado para desplegar el resumen por productos
  const [mostrarDetalleHoy, setMostrarDetalleHoy] = useState(false);
  const [listaHoy, setListaHoy] = useState([]);

  // Formulario para producto nuevo
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [codigoEscaneado, setCodigoEscaneado] = useState('');
  const [esNuevo, setEsNuevo] = useState(false);

  // Cargar el total acumulado y desglose por producto del día
  const cargarTotalHoy = async () => {
    const inicioHoy = new Date();
    inicioHoy.setHours(0, 0, 0, 0);

    const { data, error } = await supabase
      .from('registros_conteo')
      .select('cantidad_piso, productos(nombre, codigo_barras)')
      .gte('created_at', inicioHoy.toISOString());

    if (!error && data) {
      // Suma total de unidades
      const suma = data.reduce((acc, curr) => acc + (curr.cantidad_piso || 0), 0);
      setTotalHoy(suma);

      // Agrupar totales por cada producto escaneado hoy
      const acumulado = {};
      data.forEach(item => {
        const nombre = item.productos?.nombre || 'Producto sin nombre';
        const codigo = item.productos?.codigo_barras || '';
        const key = `${nombre}_${codigo}`;

        if (!acumulado[key]) {
          acumulado[key] = { nombre, codigo, cantidad: 0 };
        }
        acumulado[key].cantidad += item.cantidad_piso || 0;
      });

      setListaHoy(Object.values(acumulado));
    }
  };

  useEffect(() => {
    cargarTotalHoy();
  }, []);

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

      // Actualizar total y desglose inmediatamente
      cargarTotalHoy();

      setTimeout(() => setMensaje(''), 3000);

    } catch (err) {
      console.error(err);
      setProducto(null);
    }
  };

  const exportarExcelHoy = async () => {
    const inicioHoy = new Date();
    inicioHoy.setHours(0, 0, 0, 0);

    const { data, error } = await supabase
      .from('registros_conteo')
      .select('id, created_at, cantidad_piso, tipo_registro, productos(nombre, codigo_barras)')
      .gte('created_at', inicioHoy.toISOString())
      .order('created_at', { ascending: true });

    if (error || !data || data.length === 0) {
      alert("No hay conteos registrados en la bolsa para exportar.");
      return;
    }

    // 1. Crear y descargar el archivo Excel
    const datosFormateados = data.map(row => ({
      'Hora': new Date(row.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      'Código': row.productos?.codigo_barras || '',
      'Producto': row.productos?.nombre || '',
      'Cantidad en Piso': row.cantidad_piso,
      'Evento': row.tipo_registro
    }));

    const fechaHoy = new Date().toISOString().slice(0, 10);
    const worksheet = XLSX.utils.json_to_sheet(datosFormateados);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Conteos Hoy");
    XLSX.writeFile(workbook, `Reporte_Inventario_${fechaHoy}.xlsx`);

    // 2. Vaciar los registros procesados de la bolsa
    const idsAEliminar = data.map(item => item.id);
    const { error: deleteError } = await supabase
      .from('registros_conteo')
      .delete()
      .in('id', idsAEliminar);

    if (deleteError) {
      console.error("Error al vaciar la bolsa:", deleteError);
    } else {
      setMensaje('¡Excel exportado y bolsa vaciada a 0 unidades!');
      setMostrarDetalleHoy(false);
      cargarTotalHoy(); // Reinicia el contador a 0 en pantalla
      setTimeout(() => setMensaje(''), 4000);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-rose-50 via-pink-50/50 to-slate-100 p-4 max-w-md mx-auto text-slate-800 font-sans pb-10">
      {/* Encabezado Estilo Beauty */}
      <header className="mb-4 text-center pt-2">
        <div className="inline-flex items-center gap-1.5 px-3.5 py-1 bg-rose-100/80 text-rose-700 rounded-full text-xs font-bold tracking-wide uppercase mb-2 border border-rose-200">
          <Sparkles size={14} /> Belleza Ulta
        </div>
        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Control de Productos</h1>
        <p className="text-xs text-rose-500 font-semibold mt-0.5">Monitoreo y Conteo en Piso de Venta</p>
      </header>

      {/* Tarjeta Resumen del Día Interactiva */}
      <div className="bg-white/90 backdrop-blur border border-rose-100 rounded-2xl p-4 mb-4 shadow-sm">
        <div 
          onClick={() => setMostrarDetalleHoy(!mostrarDetalleHoy)}
          className="flex items-center justify-between cursor-pointer select-none"
        >
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              Total Escaneado Hoy {mostrarDetalleHoy ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </p>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-3xl font-black text-rose-600">{totalHoy}</span>
              <span className="text-xs font-bold text-slate-600">unidades registradas</span>
            </div>
          </div>
          <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-xl flex items-center justify-center font-bold shrink-0 shadow-sm active:scale-95 transition">
            <ShoppingBag size={22} />
          </div>
        </div>

        {/* Lista Desplegable de Productos Escaneados Hoy */}
        {mostrarDetalleHoy && (
          <div className="mt-4 pt-3 border-t border-rose-100 space-y-2">
            <h3 className="text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-2">
              Desglose por Producto ({listaHoy.length})
            </h3>
            {listaHoy.length === 0 ? (
              <p className="text-xs text-slate-400 italic">No se han registrado productos hoy.</p>
            ) : (
              <div className="max-h-52 overflow-y-auto space-y-2 pr-1">
                {listaHoy.map((item, index) => (
                  <div key={index} className="flex justify-between items-center bg-rose-50/70 p-2.5 rounded-xl border border-rose-100/80">
                    <div className="max-w-[75%]">
                      <p className="text-xs font-bold text-slate-800 truncate">{item.nombre}</p>
                      <p className="text-[10px] text-slate-400 font-mono">{item.codigo}</p>
                    </div>
                    <span className="px-2.5 py-1 bg-white text-rose-600 font-black text-xs rounded-lg shadow-sm border border-rose-100 shrink-0">
                      {item.cantidad} pcs
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Alerta de confirmación */}
      {mensaje && (
        <div className="mb-4 p-3.5 bg-emerald-50 border border-emerald-300 text-emerald-800 rounded-2xl flex items-center gap-2 text-sm shadow-sm">
          <CheckCircle2 className="text-emerald-500 shrink-0" size={20} />
          <span className="font-semibold">{mensaje}</span>
        </div>
      )}

      {/* Botón Principal de Escaneo */}
      {!scanning && !producto && !esNuevo && (
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
        <div className="mt-4 bg-white p-5 rounded-2xl shadow-lg border border-amber-200">
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
        <div className="mt-4 bg-white p-5 rounded-2xl shadow-xl border border-rose-100 space-y-4">
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
      <div className="mt-6 pt-4 border-t border-rose-100">
        <button
          onClick={exportarExcelHoy}
          className="w-full bg-slate-900 hover:bg-slate-800 text-white py-3.5 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow transition"
        >
          <FileSpreadsheet size={18} className="text-emerald-400" /> Exportar Informe del Día a Excel
        </button>
      </div>
    </div>
  );
}