import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { Scanner } from './components/Scanner';
import * as XLSX from 'xlsx';
import { 
  Scan, Plus, FileSpreadsheet, Sparkles, CheckCircle2, PackageCheck, 
  ShoppingBag, ChevronDown, ChevronUp, User, UserCheck, X, Pencil, Trash2, Check 
} from 'lucide-react';

export default function App() {
  const [scanning, setScanning] = useState(false);
  const [producto, setProducto] = useState(null);
  const [cantidad, setCantidad] = useState(1);
  const [tipoRegistro, setTipoRegistro] = useState('inicio_turno');
  const [mensaje, setMensaje] = useState('');
  const [totalHoy, setTotalHoy] = useState(0);

  // Nombre del usuario/colaboradora
  const [nombreUsuario, setNombreUsuario] = useState(() => localStorage.getItem('ulta_usuario') || '');
  const [inputNombre, setInputNombre] = useState('');
  const [editandoUsuario, setEditandoUsuario] = useState(false);

  // Estado para desplegar la bolsa
  const [mostrarDetalleHoy, setMostrarDetalleHoy] = useState(false);
  const [listaHoy, setListaHoy] = useState([]);

  // Estados para edición directa por turno (Inicio / Corte / Cierre)
  const [editTurnoTarget, setEditTurnoTarget] = useState(null); // { key, turnType, id, codigo, nombre, producto_id }
  const [cantEditadaTurno, setCantEditadaTurno] = useState(0);

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

  // Cargar totales únicos por producto y desgloses por turno
  const cargarTotalHoy = async () => {
    if (!nombreUsuario) return;

    const inicioHoy = new Date();
    inicioHoy.setHours(0, 0, 0, 0);

    const { data, error } = await supabase
      .from('registros_conteo')
      .select('id, created_at, cantidad_piso, tipo_registro, codigo_barras, producto_id, productos(id, nombre, codigo_barras)')
      .gte('created_at', inicioHoy.toISOString())
      .eq('usuario', nombreUsuario)
      .order('created_at', { ascending: false });

    if (!error && data) {
      const acumulado = {};
      data.forEach(item => {
        const nombre = item.productos?.nombre || 'Producto sin nombre';
        const codigo = item.productos?.codigo_barras || item.codigo_barras || '';
        const key = `${nombre}_${codigo}`;
        const tipo = item.tipo_registro || 'inicio_turno';
        const cant = item.cantidad_piso || 0;
        const prodId = item.producto_id || item.productos?.id;

        if (!acumulado[key]) {
          acumulado[key] = {
            key,
            nombre,
            codigo,
            producto_id: prodId,
            ids: [],
            turns: {
              inicio_turno: { id: null, cant: 0 },
              corte_horario: { id: null, cant: 0 },
              fin_turno: { id: null, cant: 0 }
            }
          };
        }

        acumulado[key].ids.push(item.id);

        if (!acumulado[key].turns[tipo].id) {
          acumulado[key].turns[tipo].id = item.id;
        }
        acumulado[key].turns[tipo].cant += cant;
      });

      // Determinar la cantidad real única por producto (prioriza Inicio de Turno)
      const listaAgrupada = Object.values(acumulado).map(item => {
        let totalCalculado = 0;
        if (item.turns.inicio_turno.cant > 0) {
          totalCalculado = item.turns.inicio_turno.cant;
        } else if (item.turns.corte_horario.cant > 0) {
          totalCalculado = item.turns.corte_horario.cant;
        } else {
          totalCalculado = item.turns.fin_turno.cant;
        }

        return {
          ...item,
          total: totalCalculado
        };
      });

      const sumaTotalUnica = listaAgrupada.reduce((acc, curr) => acc + curr.total, 0);

      setTotalHoy(sumaTotalUnica);
      setListaHoy(listaAgrupada);
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

  // --- Editar un Turno Específico (Inicio / Corte / Cierre) ---
  const iniciarEdicionTurno = (item, turnType) => {
    const turnData = item.turns[turnType];
    setEditTurnoTarget({
      key: item.key,
      turnType: turnType,
      id: turnData.id,
      codigo: item.codigo,
      nombre: item.nombre,
      producto_id: item.producto_id
    });
    setCantEditadaTurno(turnData.cant);
  };

  const guardarEdicionTurno = async () => {
    if (!editTurnoTarget) return;

    const { id, turnType, codigo, nombre, producto_id } = editTurnoTarget;

    if (id) {
      if (cantEditadaTurno <= 0) {
        const { error } = await supabase.from('registros_conteo').delete().eq('id', id);
        if (error) alert("Error al eliminar conteo: " + error.message);
      } else {
        const { error } = await supabase
          .from('registros_conteo')
          .update({ cantidad_piso: cantEditadaTurno })
          .eq('id', id);
        if (error) alert("Error al actualizar conteo: " + error.message);
      }
    } else if (cantEditadaTurno > 0) {
      let prodId = producto_id;

      if (!prodId) {
        const { data: upsertedProd } = await supabase
          .from('productos')
          .upsert({ codigo_barras: codigo, nombre: nombre }, { onConflict: 'codigo_barras' })
          .select()
          .single();
        prodId = upsertedProd?.id;
      }

      const { error } = await supabase.from('registros_conteo').insert([{
        producto_id: prodId || null,
        codigo_barras: codigo,
        usuario: nombreUsuario,
        tipo_registro: turnType,
        cantidad_piso: cantEditadaTurno
      }]);
      if (error) alert("Error al registrar conteo: " + error.message);
    }

    setEditTurnoTarget(null);
    setMensaje('¡Conteo del turno actualizado!');
    cargarTotalHoy();
    setTimeout(() => setMensaje(''), 3000);
  };

  const eliminarProductoCompleto = async (item) => {
    if (!window.confirm(`¿Deseas eliminar "${item.nombre}" de tu bolsa?`)) return;

    const { error } = await supabase
      .from('registros_conteo')
      .delete()
      .in('id', item.ids);

    if (error) {
      alert("Error al eliminar: " + error.message);
    } else {
      setEditTurnoTarget(null);
      setMensaje('Producto eliminado de tu bolsa.');
      cargarTotalHoy();
      setTimeout(() => setMensaje(''), 3000);
    }
  };

  // Exportación optimizada para vaciar la bolsa en iOS y Android
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
      'Evento': row.tipo_registro === 'inicio_turno' ? 'Inicio de Turno' :
                row.tipo_registro === 'fin_turno' ? 'Fin de Turno' : 'Corte Horario'
    }));

    const fechaHoy = new Date().toISOString().slice(0, 10);
    const worksheet = XLSX.utils.json_to_sheet(datosFormateados);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, `Conteos_${nombreUsuario}`);

    const idsAEliminar = data.map(item => item.id);
    const { error: deleteError } = await supabase
      .from('registros_conteo')
      .delete()
      .in('id', idsAEliminar);

    if (deleteError) {
      alert("Error al vaciar la bolsa en la base de datos: " + deleteError.message);
      return;
    }

    setTotalHoy(0);
    setListaHoy([]);
    setMostrarDetalleHoy(false);
    setMensaje(`¡Excel de ${nombreUsuario} exportado y bolsa vaciada a 0!`);

    XLSX.writeFile(workbook, `Reporte_${nombreUsuario}_${fechaHoy}.xlsx`);

    setTimeout(() => setMensaje(''), 4000);
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

      {/* Sección Bolsa con Edición por Turno */}
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
            <h3 className="text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-2">
              Resumen de Productos ({listaHoy.length})
            </h3>
            {listaHoy.length === 0 ? (
              <p className="text-xs text-slate-400 italic">No has registrado productos en tu bolsa hoy.</p>
            ) : (
              <div className="max-h-80 overflow-y-auto space-y-3 pr-1">
                {listaHoy.map((item) => (
                  <div key={item.key} className="bg-rose-50/70 p-3 rounded-xl border border-rose-100/80 space-y-2">
                    <div className="flex justify-between items-start gap-2">
                      <div className="max-w-[65%]">
                        <p className="text-xs font-bold text-slate-800 leading-tight">{item.nombre}</p>
                        <p className="text-[10px] text-slate-400 font-mono mt-0.5">{item.codigo}</p>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="px-2.5 py-1 bg-white text-rose-600 font-black text-xs rounded-lg shadow-sm border border-rose-100">
                          Total: {item.total} pcs
                        </span>
                        <button
                          onClick={() => eliminarProductoCompleto(item)}
                          className="p-1.5 bg-rose-100 hover:bg-rose-200 text-rose-600 rounded-lg transition"
                          title="Eliminar producto"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>

                    {/* Desglose por Turno con Botón de Edición Individual */}
                    <div className="pt-2 border-t border-rose-200/60">
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                        Desglose por turno (toca ✏️ para modificar):
                      </p>
                      <div className="grid grid-cols-3 gap-1.5 text-[10px]">

                        {/* Cuadro Inicio */}
                        <div className={`p-1.5 rounded-lg text-center border relative transition ${
                          editTurnoTarget?.key === item.key && editTurnoTarget?.turnType === 'inicio_turno'
                            ? 'bg-rose-100 border-rose-400 ring-2 ring-rose-200'
                            : 'bg-white/90 border-slate-100'
                        }`}>
                          <div className="flex items-center justify-between px-0.5">
                            <span className="text-slate-400 font-medium text-[9px]">🔓 Inicio</span>
                            <button
                              onClick={() => iniciarEdicionTurno(item, 'inicio_turno')}
                              className="text-slate-400 hover:text-rose-600 transition"
                              title="Modificar Inicio"
                            >
                              <Pencil size={10} />
                            </button>
                          </div>
                          <span className="block font-extrabold text-slate-800 text-xs mt-0.5">
                            {item.turns.inicio_turno.cant} pcs
                          </span>
                        </div>

                        {/* Cuadro Corte */}
                        <div className={`p-1.5 rounded-lg text-center border relative transition ${
                          editTurnoTarget?.key === item.key && editTurnoTarget?.turnType === 'corte_horario'
                            ? 'bg-rose-100 border-rose-400 ring-2 ring-rose-200'
                            : 'bg-white/90 border-slate-100'
                        }`}>
                          <div className="flex items-center justify-between px-0.5">
                            <span className="text-slate-400 font-medium text-[9px]">⏱️ Corte</span>
                            <button
                              onClick={() => iniciarEdicionTurno(item, 'corte_horario')}
                              className="text-slate-400 hover:text-rose-600 transition"
                              title="Modificar Corte"
                            >
                              <Pencil size={10} />
                            </button>
                          </div>
                          <span className="block font-extrabold text-slate-800 text-xs mt-0.5">
                            {item.turns.corte_horario.cant} pcs
                          </span>
                        </div>

                        {/* Cuadro Cierre */}
                        <div className={`p-1.5 rounded-lg text-center border relative transition ${
                          editTurnoTarget?.key === item.key && editTurnoTarget?.turnType === 'fin_turno'
                            ? 'bg-rose-100 border-rose-400 ring-2 ring-rose-200'
                            : 'bg-white/90 border-slate-100'
                        }`}>
                          <div className="flex items-center justify-between px-0.5">
                            <span className="text-slate-400 font-medium text-[9px]">🔒 Cierre</span>
                            <button
                              onClick={() => iniciarEdicionTurno(item, 'fin_turno')}
                              className="text-slate-400 hover:text-rose-600 transition"
                              title="Modificar Cierre"
                            >
                              <Pencil size={10} />
                            </button>
                          </div>
                          <span className="block font-extrabold text-slate-800 text-xs mt-0.5">
                            {item.turns.fin_turno.cant} pcs
                          </span>
                        </div>

                      </div>
                    </div>

                    {/* Panel de Edición Inline para el Turno Seleccionado */}
                    {editTurnoTarget?.key === item.key && (
                      <div className="mt-2 pt-2 border-t border-rose-200 flex items-center justify-between gap-2 bg-white p-2 rounded-lg border border-rose-300 shadow-sm">
                        <span className="text-[11px] font-bold text-slate-700">
                          Modificar {
                            editTurnoTarget.turnType === 'inicio_turno' ? '🔓 Inicio' :
                            editTurnoTarget.turnType === 'corte_horario' ? '⏱️ Corte' : '🔒 Cierre'
                          }:
                        </span>
                        
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setCantEditadaTurno(Math.max(0, cantEditadaTurno - 1))}
                            className="w-7 h-7 bg-slate-100 text-slate-800 font-bold rounded border border-slate-200 active:bg-slate-200"
                          >-</button>
                          <input
                            type="number"
                            value={cantEditadaTurno}
                            onChange={(e) => setCantEditadaTurno(parseInt(e.target.value) || 0)}
                            className="w-12 text-center text-xs font-black text-rose-600 border border-slate-200 rounded py-1"
                          />
                          <button
                            onClick={() => setCantEditadaTurno(cantEditadaTurno + 1)}
                            className="w-7 h-7 bg-slate-100 text-slate-800 font-bold rounded border border-slate-200 active:bg-slate-200"
                          >+</button>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            onClick={guardarEdicionTurno}
                            className="p-1.5 bg-emerald-500 text-white rounded-md hover:bg-emerald-600 transition"
                            title="Guardar"
                          >
                            <Check size={14} />
                          </button>
                          <button
                            onClick={() => setEditTurnoTarget(null)}
                            className="p-1.5 bg-slate-200 text-slate-600 rounded-md hover:bg-slate-300 transition"
                            title="Cancelar"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      </div>
                    )}
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

      {/* Tarjeta Producto Nuevo con Cancelar */}
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
              <option value="corte_horario">⏱️ Corte Horario</option>
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