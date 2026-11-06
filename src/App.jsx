import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { Scanner } from './components/Scanner';
import * as XLSX from 'xlsx';
import { Scan, Plus, FileSpreadsheet, Sparkles, CheckCircle2, PackageCheck, ShoppingBag, ChevronDown, ChevronUp, User, UserCheck, X } from 'lucide-react';

export default function App() {
  const [scanning, setScanning] = useState(false);
  const [producto, setProducto] = useState(null);
  const [cantidad, setCantidad] = useState(1);
  const [tipoRegistro, setTipoRegistro] = useState('corte_horario');
  const [mensaje, setMensaje] = useState('');
  const [totalHoy, setTotalHoy] = useState(0);

  // Nombre del usuario/colaboradora
  const [nombreUsuario, setNombreUsuario] = useState(() => localStorage.getItem('ulta_usuario') || '');
  const [inputNombre, setInputNombre] = useState('');
  const [editandoUsuario, setEditandoUsuario] = useState(false);

  // Estado para desplegar la bolsa
  const [mostrarDetalleHoy, setMostrarDetalleHoy] = useState(false);
  const [listaHoy, setListaHoy] = useState([]);

  // Formulario para producto nuevo
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [codigoEscaneado, setCodigoEscaneado] = useState('');
  const [esNuevo, setEsNuevo] = useState(false);
  const [procesando, setProcesando] = useState(false);

  // Sincronización de escaneos offline
  useEffect(() => {
    const sincronizarOffline = async () => {
      const cola = JSON.parse(localStorage.getItem('cola_escaneos') || '[]');
      if (cola.length > 0 && navigator.onLine) {
        const { error } = await supabase.from('registros_conteo').insert(cola);
        if (!error) {
          localStorage.removeItem('cola_escaneos');
          setMensaje('¡Escaneos guardados offline sincronizados!');
          cargarTotalHoy();
          setTimeout(() => setMensaje(''), 4000);
        }
      }
    };

    window.addEventListener('online', sincronizarOffline);
    sincronizarOffline();

    return () => window.removeEventListener('online', sincronizarOffline);
  }, [nombreUsuario]);

  // Despertar la cámara tras cambio de app
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && scanning) {
        setScanning(false);
        setTimeout(() => setScanning(true), 150);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [scanning]);

  // Cargar totales y desglose por producto
  const cargarTotalHoy = async () => {
    if (!nombreUsuario) return;

    const inicioHoy = new Date();
    inicioHoy.setHours(0, 0, 0, 0);

    const { data, error } = await supabase
      .from('registros_conteo')
      .select('cantidad_piso, tipo_registro, codigo_barras, productos(nombre, codigo_barras)')
      .gte('created_at', inicioHoy.toISOString())
      .eq('usuario', nombreUsuario);

    if (!error && data) {
      const sumaTotal = data.reduce((acc, curr) => acc + (curr.cantidad_piso || 0), 0);
      setTotalHoy(sumaTotal);

      // Agrupar productos con desglose por tipo de registro
      const acumulado = {};
      data.forEach(item => {
        const nombre = item.productos?.nombre || 'Producto sin nombre';
        const codigo = item.productos?.codigo_barras || item.codigo_barras || '';
        const key = `${nombre}_${codigo}`;
        const tipo = item.tipo_registro || 'corte_horario';
        const cant = item.cantidad_piso || 0;

        if (!acumulado[key]) {
          acumulado[key] = {
            nombre,
            codigo,
            total: 0,
            desglose: {
              inicio_turno: 0,
              corte_horario: 0,
              fin_turno: 0
            }
          };
        }

        acumulado[key].total += cant;
        if (acumulado[key].desglose[tipo] !== undefined) {
          acumulado[key].desglose[tipo] += cant;
        } else {
          acumulado[key].desglose[tipo] = cant;
        }
      });

      setListaHoy(Object.values(acumulado));
    }
  };

  useEffect(() => {
    cargarTotalHoy();
  }, [nombreUsuario]);

  const guardarNombreUsuario = (e) => {
    e.preventDefault();
    if (!inputNombre.trim()) return;
    const nombreLimpio = inputNombre.trim();
    localStorage.setItem('ulta_usuario', nombreLimpio);
    setNombreUsuario(nombreLimpio);
    setEditandoUsuario(false);
  };

  const handleScan = async (code) => {
    setScanning(false);
    const codigoLimpio = String(code).trim();
    setCodigoEscaneado(codigoLimpio);

    const { data } = await supabase
      .from('productos')
      .select('*')
      .eq('codigo_barras', codigoLimpio)
      .maybeSingle();

    if (data) {
      setProducto(data);
      setEsNuevo(false);
    } else {
      setProducto(null);
      setEsNuevo(true);
    }
  };

  const crearProducto = async () => {
    if (!nuevoNombre.trim() || !codigoEscaneado) return;

    const codigoLimpio = String(codigoEscaneado).trim();

    const { data, error } = await supabase
      .from('productos')
      .upsert(
        { codigo_barras: codigoLimpio, nombre: nuevoNombre.trim() },
        { onConflict: 'codigo_barras' }
      )
      .select()
      .single();

    if (error) {
      alert("Error en Supabase: " + error.message);
      return;
    }

    if (data) {
      setProducto(data);
      setEsNuevo(false);
      setNuevoNombre('');
    }
  };

  const cancelarProductoNuevo = () => {
    setEsNuevo(false);
    setCodigoEscaneado('');
    setNuevoNombre('');
  };

  const guardarRegistro = async (codigoParam, datosProductoParam) => {
    if (procesando) return;
    setProcesando(true);

    const codigo = String(codigoParam || producto?.codigo_barras || codigoEscaneado).trim();
    const nombreProd = datosProductoParam?.nombre || producto?.nombre || nuevoNombre || 'Producto Escaneado';

    if (!codigo) {
      setMensaje('Error: No hay un código válido.');
      setProcesando(false);
      return;
    }

    try {
      let prodData = producto;

      if (!prodData || !prodData.id) {
        const { data: upsertedProd, error: prodErr } = await supabase
          .from('productos')
          .upsert(
            { codigo_barras: codigo, nombre: nombreProd },
            { onConflict: 'codigo_barras' }
          )
          .select()
          .single();

        if (prodErr) throw prodErr;
        prodData = upsertedProd;
      }

      const nuevoRegistro = {
        producto_id: prodData?.id || null,
        codigo_barras: codigo,
        usuario: nombreUsuario,
        tipo_registro: tipoRegistro,
        cantidad_piso: cantidad
      };

      if (!navigator.onLine) {
        const cola = JSON.parse(localStorage.getItem('cola_escaneos') || '[]');
        cola.push(nuevoRegistro);
        localStorage.setItem('cola_escaneos', JSON.stringify(cola));
        setMensaje('Sin conexión: guardado localmente.');
        setProducto(null);
        setCantidad(1);
        setProcesando(false);
        setTimeout(() => setMensaje(''), 4000);
        return;
      }

      const { error } = await supabase.from('registros_conteo').insert([nuevoRegistro]);
      if (error) throw error;

      setMensaje('¡Producto registrado correctamente!');
      setProducto(null);
      setCantidad(1);
      cargarTotalHoy();
      setTimeout(() => setMensaje(''), 4000);
    } catch (err) {
      setMensaje(`Error al guardar: ${err.message}`);
      setTimeout(() => setMensaje(''), 5000);
    } finally {
      setTimeout(() => setProcesando(false), 1200);
    }
  };

  const exportarExcelHoy = async () => {
    if (!nombreUsuario) return;

    const inicioHoy = new Date();
    inicioHoy.setHours(0, 0, 0, 0);

    const { data, error } = await supabase
      .from('registros_conteo')
      .select('id, created_at, cantidad_piso, tipo_registro, codigo_barras, productos(nombre, codigo_barras)')
      .gte('created_at', inicioHoy.toISOString())
      .eq('usuario', nombreUsuario)
      .order('created_at', { ascending: true });

    if (error || !data || data.length === 0) {
      alert(`No hay conteos registrados en la bolsa de ${nombreUsuario}.`);
      return;
    }

    const datosFormateados = data.map(row => ({
      'Usuario': nombreUsuario,
      'Hora': new Date(row.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      'Código': row.productos?.codigo_barras || row.codigo_barras || '',
      'Producto': row.productos?.nombre || 'Producto sin nombre',
      'Cantidad en Piso': row.cantidad_piso,
      'Evento': row.tipo_registro
    }));

    const fechaHoy = new Date().toISOString().slice(0, 10);
    const worksheet = XLSX.utils.json_to_sheet(datosFormateados);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, `Conteos_${nombreUsuario}`);
    XLSX.writeFile(workbook, `Reporte_${nombreUsuario}_${fechaHoy}.xlsx`);

    const idsAEliminar = data.map(item => item.id);
    const { error: deleteError } = await supabase
      .from('registros_conteo')
      .delete()
      .in('id', idsAEliminar);

    if (!deleteError) {
      setMensaje(`¡Excel de ${nombreUsuario} exportado y bolsa vaciada a 0!`);
      setMostrarDetalleHoy(false);
      cargarTotalHoy();
      setTimeout(() => setMensaje(''), 4000);
    }
  };

  if (!nombreUsuario || editandoUsuario) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-rose-50 via-pink-50 to-slate-100 p-6 max-w-md mx-auto text-slate-800 flex items-center justify-center font-sans">
        <div className="bg-white p-6 rounded-3xl shadow-xl border border-rose-100 w-full text-center">
          <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <User size={32} />
          </div>
          <h2 className="text-xl font-extrabold text-slate-900 mb-1">¡Bienvenid@!</h2>
          <p className="text-xs text-slate-500 mb-5">Ingresa tu nombre para identificar tus conteos</p>
          
          <form onSubmit={guardarNombreUsuario} className="space-y-3">
            <input
              type="text"
              placeholder="Ej. Laura / Fernanda"
              value={inputNombre}
              onChange={(e) => setInputNombre(e.target.value)}
              className="w-full p-3.5 border border-slate-200 rounded-xl text-center text-base font-bold focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-100"
              autoFocus
            />
            <button
              type="submit"
              className="w-full bg-gradient-to-r from-rose-500 to-pink-600 text-white py-3.5 rounded-xl font-bold shadow-md shadow-rose-500/20 active:scale-95 transition flex items-center justify-center gap-2"
            >
              <UserCheck size={18} /> Comenzar Turno
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-rose-50 via-pink-50/50 to-slate-100 p-4 max-w-md mx-auto text-slate-800 font-sans pb-10">
      <header className="mb-3 text-center pt-2">
        <div className="inline-flex items-center gap-1.5 px-3.5 py-1 bg-rose-100/80 text-rose-700 rounded-full text-xs font-bold tracking-wide uppercase mb-2 border border-rose-200">
          <Sparkles size={14} /> Belleza Ulta
        </div>
        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Control de Productos</h1>
        
        <div className="mt-1 flex items-center justify-center gap-2">
          <span className="text-xs text-slate-500 font-medium">¡HOLA! <strong className="text-rose-600 font-bold">{nombreUsuario}</strong></span>
          <button 
            onClick={() => { setInputNombre(nombreUsuario); setEditandoUsuario(true); }}
            className="text-[10px] bg-slate-200/80 hover:bg-slate-300 text-slate-700 px-2 py-0.5 rounded-md font-semibold transition"
          >
            Cambiar
          </button>
        </div>
      </header>

      {/* Sección Bolsa con Desglose */}
      <div className="bg-white/90 backdrop-blur border border-rose-100 rounded-2xl p-4 mb-4 shadow-sm">
        <div 
          onClick={() => setMostrarDetalleHoy(!mostrarDetalleHoy)}
          className="flex items-center justify-between cursor-pointer select-none"
        >
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              Mi Total Hoy {mostrarDetalleHoy ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </p>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-3xl font-black text-rose-600">{totalHoy}</span>
              <span className="text-xs font-bold text-slate-600">unidades en mi bolsa</span>
            </div>
          </div>
          <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-xl flex items-center justify-center font-bold shrink-0 shadow-sm active:scale-95 transition">
            <ShoppingBag size={22} />
          </div>
        </div>

        {mostrarDetalleHoy && (
          <div className="mt-4 pt-3 border-t border-rose-100 space-y-3">
            <h3 className="text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-1">
              Mis Productos Escaneados ({listaHoy.length})
            </h3>
            {listaHoy.length === 0 ? (
              <p className="text-xs text-slate-400 italic">No has registrado productos en tu bolsa hoy.</p>
            ) : (
              <div className="max-h-64 overflow-y-auto space-y-2.5 pr-1">
                {listaHoy.map((item, index) => (
                  <div key={index} className="bg-rose-50/70 p-3 rounded-xl border border-rose-100/80 space-y-2">
                    <div className="flex justify-between items-start">
                      <div className="max-w-[70%]">
                        <p className="text-xs font-bold text-slate-800 leading-tight">{item.nombre}</p>
                        <p className="text-[10px] text-slate-400 font-mono mt-0.5">{item.codigo}</p>
                      </div>
                      <span className="px-2.5 py-1 bg-white text-rose-600 font-black text-xs rounded-lg shadow-sm border border-rose-100 shrink-0">
                        Total: {item.total} pcs
                      </span>
                    </div>

                    {/* Apartado Desglose */}
                    <div className="pt-2 border-t border-rose-200/60">
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Desglose por turno:</p>
                      <div className="grid grid-cols-3 gap-1.5 text-[10px]">
                        <div className="bg-white/90 p-1.5 rounded-lg text-center border border-slate-100 shadow-2xs">
                          <span className="block text-slate-400 font-medium">🔓 Mañana</span>
                          <span className="font-extrabold text-slate-800">{item.desglose.inicio_turno} pcs</span>
                        </div>
                        <div className="bg-white/90 p-1.5 rounded-lg text-center border border-slate-100 shadow-2xs">
                          <span className="block text-slate-400 font-medium">🔒 Cierre</span>
                          <span className="font-extrabold text-slate-800">{item.desglose.fin_turno} pcs</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {mensaje && (
        <div className="mb-4 p-3.5 bg-emerald-50 border border-emerald-300 text-emerald-800 rounded-2xl flex items-center gap-2 text-sm shadow-sm">
          <CheckCircle2 className="text-emerald-500 shrink-0" size={20} />
          <span className="font-semibold">{mensaje}</span>
        </div>
      )}

      {!scanning && !producto && !esNuevo && (
        <button
          onClick={() => setScanning(true)}
          className="w-full bg-gradient-to-r from-rose-500 via-pink-500 to-rose-600 text-white py-4 px-6 rounded-2xl font-bold flex items-center justify-center gap-3 shadow-lg shadow-rose-500/25 active:scale-95 transition-all hover:brightness-105"
        >
          <Scan size={22} /> Escanear Código de Barras
        </button>
      )}

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

      {/* Tarjeta Producto Nuevo con Opción de Cancelar */}
      {esNuevo && (
        <div className="mt-4 bg-white p-5 rounded-2xl shadow-lg border border-amber-200">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-amber-700">
              <PackageCheck size={20} />
              <h2 className="font-bold text-base">Producto Nuevo Detectado</h2>
            </div>
            <button 
              onClick={cancelarProductoNuevo}
              className="text-slate-400 hover:text-slate-600 transition p-1"
            >
              <X size={18} />
            </button>
          </div>
          <p className="text-xs text-slate-400 mb-3 font-mono">Código: {codigoEscaneado}</p>
          <input
            type="text"
            placeholder="Ej. Labial Matte Maybelline Red #5"
            value={nuevoNombre}
            onChange={(e) => setNuevoNombre(e.target.value)}
            className="w-full p-3 border border-slate-200 rounded-xl mb-3 text-sm focus:outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100"
          />
          <div className="space-y-2">
            <button
              onClick={crearProducto}
              className="w-full bg-slate-900 text-white py-3 rounded-xl font-semibold flex items-center justify-center gap-1.5 text-sm shadow hover:bg-slate-800 transition"
            >
              <Plus size={18} /> Registrar y Continuar
            </button>
            <button
              onClick={cancelarProductoNuevo}
              className="w-full bg-slate-100 text-slate-600 py-2.5 rounded-xl font-semibold text-xs border border-slate-200 hover:bg-slate-200 transition"
            >
              Cancelar Escaneo
            </button>
          </div>
        </div>
      )}

      {producto && (
        <div className="mt-4 bg-white p-5 rounded-2xl shadow-xl border border-rose-100 space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <span className="text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 bg-rose-100 text-rose-700 rounded-md">Producto Escaneado</span>
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
              <option value="inicio_turno">🔓 Inicio de Turno (Mañana)</option>
              <option value="fin_turno">🔒 Fin de Turno (Cierre)</option>
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
            onClick={() => guardarRegistro(producto?.codigo_barras, producto)}
            disabled={procesando}
            className={`w-full text-white py-3.5 rounded-xl font-bold shadow-md shadow-rose-500/20 active:scale-95 transition ${
              procesando ? 'bg-slate-400 cursor-not-allowed' : 'bg-gradient-to-r from-rose-600 to-pink-600'
            }`}
          >
            {procesando ? 'Guardando...' : 'Registrar Conteo'}
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

      <div className="mt-6 pt-4 border-t border-rose-100">
        <button
          onClick={exportarExcelHoy}
          className="w-full bg-slate-900 hover:bg-slate-800 text-white py-3.5 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow transition"
        >
          <FileSpreadsheet size={18} className="text-emerald-400" /> Exportar Mi Informe a Excel
        </button>
      </div>
    </div>
  );
}