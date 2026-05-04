import { collectAutomated, saveOffers } from "../../_lib/ml-utils.js";

const CATEGORY_KEYWORDS = {
  "Tecnologia": ["smartphone", "notebook", "smart tv", "fone bluetooth", "monitor gamer", "placa de vídeo", "tablet"],
  "Casa e Cozinha": ["mesa escritorio", "cadeira gamer", "sofa retratil", "guarda roupa casal", "colchao queen", "air fryer philips", "geladeira frost free", "cooktop 5 bocas"],
  "Esporte e Fitness": ["whey protein isolado", "creatina monoidratada", "bicicleta aro 29", "esteira eletrica", "tenis corrida"],
  "Ferramentas": ["furadeira martelete", "parafusadeira bosch", "kit ferramentas stanley", "lavadora alta pressao"],
  "Moda": ["tenis nike", "mochila notebook", "relogio masculino", "oculos ray ban", "jaqueta corta vento"],
  "Beleza e Saúde": ["secador taiff", "perfume importado", "barbeador eletrico", "chapinha profissional", "maquiagem kit"],
  "Automotivo": ["pneu aro 14", "multimidia android", "lampada led carro", "oleo 5w30 motul", "bateria carro"],
  "Brinquedos": ["lego star wars", "boneca barbie", "pista hot wheels", "quebra cabeça 1000 peças"]
};

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  const { marketplace = "mercadolivre", category, limit = 50 } = req.query;

  console.log("ML_OFFERS_COLLECT_START: Request received", { category, limit });

  try {
    let totalSaved = 0;
    let categoriesToProcess = CATEGORY_KEYWORDS;
    if (category && category !== "todos" && category !== "Todos") {
      const foundKey = Object.keys(CATEGORY_KEYWORDS).find(k => k.toLowerCase() === category.toLowerCase());
      if (foundKey) {
        categoriesToProcess = { [foundKey]: CATEGORY_KEYWORDS[foundKey] };
      }
    }

    const allErrors = [];

    for (const [catName, terms] of Object.entries(categoriesToProcess)) {
      // Pick a random term from each category to vary the results
      const queryTerm = terms[Math.floor(Math.random() * terms.length)];
      
      try {
        const validOffers = await collectAutomated(queryTerm, catName);
        
        if (validOffers.length > 0) {
          const savedCount = await saveOffers(validOffers);
          totalSaved += savedCount;
        }
      } catch (err) {
        console.error(`ML_OFFERS_COLLECT_ERROR: Failed for category ${catName}`, err.message);
        allErrors.push({ category: catName, error: err.message });
      }
    }

    console.log(`ML_OFFERS_COLLECT_FINISH: Total saved: ${totalSaved}`);

    return res.status(200).json({
      ok: true,
      marketplace,
      totalSaved,
      categoriesProcessed: Object.keys(categoriesToProcess).length,
      errors: allErrors.length > 0 ? allErrors : undefined
    });

  } catch (error) {
    console.error("ML_OFFERS_COLLECT_ERROR: Critical failure", error);
    return res.status(500).json({ ok: false, error: error.message });
  }
}
