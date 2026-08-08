// supabase/functions/obter-distancia/index.ts
//
// Recebe uma morada e devolve a distância (km) até à morada-base da
// empresa, via Google Distance Matrix API. A chave da API e a morada-base
// vivem em secrets do Supabase (GOOGLE_MAPS_KEY, MORADA_BASE) — nunca no
// frontend. Protegida por autenticação (verify_jwt, activo por omissão no
// deploy) — só um utilizador com sessão válida (a Nádia) pode chamar isto.
//
// Contrato:
//   POST { morada: string }
//   200  { km: number }  — km CRU (sem arredondar): a regra dos km
//        inteiros vive no cliente (obterDistancia.js), e arredondar
//        aqui a 1 decimal criava dupla arredondação (6,45 → 6,5 → 7,
//        quando a regra sobre o valor real dá 6)
//   4xx/5xx { erro: string }  — mensagem já em PT-PT, pronta a mostrar

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  let morada: string | undefined;
  try {
    const body = await req.json();
    morada = typeof body?.morada === "string" ? body.morada.trim() : undefined;
  } catch {
    return respostaErro("Pedido inválido.", 400);
  }
  if (!morada) {
    return respostaErro("Escreve uma morada para calcular a distância.", 400);
  }

  const chave = Deno.env.get("GOOGLE_MAPS_KEY");
  const moradaBase = Deno.env.get("MORADA_BASE");
  if (!chave || !moradaBase) {
    console.error(
      "obter-distancia: GOOGLE_MAPS_KEY ou MORADA_BASE em falta nos secrets",
    );
    return respostaErro("O serviço de distâncias está indisponível de momento.", 500);
  }

  const url = new URL(
    "https://maps.googleapis.com/maps/api/distancematrix/json",
  );
  url.searchParams.set("origins", moradaBase);
  url.searchParams.set("destinations", morada);
  url.searchParams.set("units", "metric");
  url.searchParams.set("key", chave);

  let dados: any;
  try {
    const resposta = await fetch(url);
    dados = await resposta.json();
  } catch (e) {
    console.error("obter-distancia: falha de rede ao chamar o Google", e);
    return respostaErro("O serviço de distâncias está indisponível de momento.", 502);
  }

  if (dados.status !== "OK") {
    console.error(
      "obter-distancia: Google devolveu status",
      dados.status,
      dados.error_message,
    );
    return respostaErro("O serviço de distâncias está indisponível de momento.", 502);
  }

  const elemento = dados.rows?.[0]?.elements?.[0];
  if (!elemento || elemento.status !== "OK") {
    return respostaErro(
      "Não foi possível calcular a distância desta morada automaticamente.",
      404,
    );
  }

  const km = elemento.distance.value / 1000;
  return new Response(JSON.stringify({ km }), {
    status: 200,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
});
