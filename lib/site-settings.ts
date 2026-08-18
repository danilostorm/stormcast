import { queryAll } from "./database";
export const siteDefaults = {
  site_title: "StormCast",
  logo_text: "StormCast",
  hero_eyebrow: "Seu conteúdo longo, pronto para o feed",
  hero_title: "Encontre o trecho que ninguém vai pular.",
  hero_description:
    "O StormCast organiza seu vídeo, destaca os momentos mais fortes e prepara cortes com enquadramento, legenda e contexto — em um fluxo simples.",
  primary_button_text: "Começar gratuitamente",
  primary_button_link: "/cadastro",
  secondary_button_text: "Ver como funciona",
  secondary_button_link: "#metodo",
  features_title: "Seu conteúdo em um único lugar.",
  plans_title: "Planos claros para validar primeiro.",
  plan_free_name: "Grátis",
  plan_free_price: "R$ 0",
  plan_creator_name: "Criador",
  plan_creator_price: "Em breve",
  plan_pro_name: "Estúdio",
  plan_pro_price: "Sob medida",
  faq_1_question: "O StormCast já processa vídeos reais?",
  faq_1_answer:
    "Sim. O sistema consulta o YouTube, transcreve o áudio, escolhe trechos reais e renderiza os MP4 com FFmpeg.",
  faq_2_question: "Quais fontes de vídeo são aceitas?",
  faq_2_answer:
    "Links individuais do YouTube de vídeos próprios ou autorizados.",
  global_notice: "",
  maintenance_mode: "0",
  primary_color: "#7c3cff",
  registration_enabled: "1",
  default_credits: "120",
  terms_content: "Termos de uso do StormCast.",
  privacy_content: "Política de privacidade do StormCast.",
};
export async function getSiteSettings() {
  const rows = await queryAll<{ key: string; value: string }>(
    "SELECT key,value FROM app_settings",
  );
  return {
    ...siteDefaults,
    ...Object.fromEntries(rows.map((row) => [row.key, row.value])),
  };
}
