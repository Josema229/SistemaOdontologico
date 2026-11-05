import { parentPort, workerData } from 'node:worker_threads';
import { openDatabase } from '../lib/db.js';
import { createAppointment } from '../lib/services.js';
const db = openDatabase(workerData.filename);
parentPort.postMessage({ ready: true });
parentPort.once('message', () => {
  try { parentPort.postMessage({ ok: true, result: createAppointment(db, workerData.actor, workerData.input, workerData.now) }); }
  catch (error) { parentPort.postMessage({ ok: false, error: error.message, status: error.status }); }
  finally { db.close(); }
});
