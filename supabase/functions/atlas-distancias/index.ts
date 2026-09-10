// supabase/functions/atlas-distancias/index.ts
//
// Serve o modo Atlas do Território (produto, TEST e PROD). É
// deliberadamente separada da `obter-distancia` (a porta dos
// orçamentos, com origem fixa na MORADA_BASE): o núcleo operacional
// do Atlas NÃO é a base de pricing, e esta função nem lê esse
// secret.
//
// Recebe COORDENADAS ao nível da localidade (centróides curados +
// a posição de um núcleo pousado no mapa) — nunca moradas, nunca PII
// — e devolve distâncias por ESTRADA em lote, via Google Distance
// Matrix (o mesmo GOOGLE_MAPS_KEY da casa). Uma origem, até 25
// destinos numa chamada só: um cenário inteiro do Atlas custa uma
// chamada por núcleo.
//
// Contrato:
//   POST { origem: [lng, lat], destinos: [[lng, lat], ...] }  (1–25)
//   200  { troncos: [{ km: number, duracaoMin: number|null } | null] }
//        — null num troço que o Google não conseguiu calcular; km CRU
//          (arredondar é do cliente, como na obter-distancia).
//   4xx/5xx { erro: string }  — mensagem em PT-PT.
//
// Protegida por autenticação (verify_jwt por omissão no deploy).

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const respostaErro = (mensagem: string, status: number) =>
  new Response(JSON.stringify({ erro: mensagem }), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });

const ponto = (p: unknown): p is [number, number] =>
  Array.isArray(p) &&
  p.length === 2 &&
  Number.isFinite(p[0]) &&
  Number.isFinite(p[1]) &&
  Math.abs(p[0]) <= 180 &&
  Math.abs(p[1]) <= 90;

// Google fala "lat,lng"; o Atlas fala [lng, lat] (a ordem do GeoJSON).
const latLng = ([lng, lat]: [number, number]) => `${lat},${lng}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  let origem: [number, number] | undefined;
  let destinos: [number, number][] | undefined;
  try {
    const body = await req.json();
    if (ponto(body?.origem)) origem = body.origem;
    if (Array.isArray(body?.destinos) && body.destinos.every(ponto)) {
      destinos = body.destinos;
    }
  } catch {
    return respostaErro("Pedido inválido.", 400);
  }
  if (!origem || !destinos || destinos.length < 1 || destinos.length > 25) {
    return respostaErro(
      "Envia uma origem e 1 a 25 destinos, todos como [lng, lat].",
      400,
    );
  }

  const chave = Deno.env.get("GOOGLE_MAPS_KEY");
  if (!chave) {
    console.error("atlas-distancias: GOOGLE_MAPS_KEY em falta nos secrets");
    return respostaErro("O serviço de distâncias está indisponível de momento.", 500);
  }

  const url = new URL(
    "https://maps.googleapis.com/maps/api/distancematrix/json",
  );
  url.searchParams.set("origins", latLng(origem));
  url.searchParams.set("destinations", destinos.map(latLng).join("|"));
  url.searchParams.set("units", "metric");
  url.searchParams.set("key", chave);

  let dados: any;
  try {
    // Timeout próprio: um Google pendurado não pode prender o pedido
    // (e o spinner de quem espera) até ao limite do runtime.
    const resposta = await fetch(url, { signal: AbortSignal.timeout(10000) });
    dados = await resposta.json();
  } catch (e) {
    console.error("atlas-distancias: falha de rede ao chamar o Google", e);
    return respostaErro("O serviço de distâncias está indisponível de momento.", 502);
  }

  if (dados.status !== "OK") {
    console.error(
      "atlas-distancias: Google devolveu status",
      dados.status,
      dados.error_message,
    );
    return respostaErro("O serviço de distâncias está indisponível de momento.", 502);
  }

  const elementos = dados.rows?.[0]?.elements;
  if (!Array.isArray(elementos) || elementos.length !== destinos.length) {
    return respostaErro("O serviço de distâncias está indisponível de momento.", 502);
  }

  const troncos = elementos.map((el: any) =>
    el?.status === "OK" && typeof el.distance?.value === "number"
      ? {
          km: el.distance.value / 1000,
          duracaoMin:
            typeof el.duration?.value === "number"
              ? Math.round(el.duration.value / 60)
              : null,
        }
      : null,
  );

  return new Response(JSON.stringify({ troncos }), {
    status: 200,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
});
