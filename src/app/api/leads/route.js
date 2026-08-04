import { NextResponse } from 'next/server';
import { addLead, leads } from './store.js';

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'JSON inválido' }, { status: 400 });
  }

  const name = (body.name || '').toString().trim();
  const contact = (body.contact || '').toString().trim();

  if (!name || !contact) {
    return NextResponse.json(
      { ok: false, error: 'Nombre y contacto (teléfono o email) son obligatorios.' },
      { status: 422 },
    );
  }

  const lead = addLead({
    name,
    contact,
    city: (body.city || '').toString().trim(),
    properties: Number(body.properties) || 0,
    message: (body.message || '').toString().trim().slice(0, 1000),
    source: (body.source || 'landing').toString().slice(0, 60),
  });

  return NextResponse.json({ ok: true, lead });
}

export async function GET() {
  // Endpoint de conveniencia para revisar prospectos captados en esta instancia.
  return NextResponse.json({ ok: true, count: leads.length, leads });
}
