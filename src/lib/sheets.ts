import { getAccessToken } from "./auth";
import { format } from "date-fns";

export async function exportToSheets(data: {
  sales: any[],
  expenses: any[],
  customers: any[],
  purchases?: any[]
}) {
  const token = await getAccessToken();
  if (!token) throw new Error("Google Drive access token missing.");

  // 1. Create a new Spreadsheet
  const title = `Relatório Eu Gerencio - ${format(new Date(), "dd/MM/yyyy")}`;
  const createRes = await fetch("https://sheets.googleapis.com/v4/spreadsheets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      properties: { title },
      sheets: [
        { properties: { title: "Vendas" } },
        { properties: { title: "Compras" } },
        { properties: { title: "Fiado" } },
      ]
    })
  });

  if (!createRes.ok) throw new Error("Failed to create spreadsheet.");
  const spreadSheet = await createRes.json();
  const spreadsheetId = spreadSheet.spreadsheetId;

  // 2. Prepare Data
  const salesData = [
    ["Data", "Tipo", "Total (R$)"],
    ...data.sales.map(s => [format(new Date(s.createdAt), "dd/MM/yyyy HH:mm"), s.type === 'cash' ? 'Dinheiro' : s.type === 'card' ? 'Cartão' : 'Fiado', Number(s.total || 0).toFixed(2)])
  ];

  const purchasesData = [
    ["Data da Compra", "Produto", "Categoria", "Qtd Unidades", "Fardos/Pacotes", "Custo Unitário (R$)", "Total Desembolsado (R$)", "Fornecedor / Local", "Observações"],
    ...(data.purchases || []).map(p => [
      p.date ? format(new Date(p.date + 'T12:00:00'), "dd/MM/yyyy") : format(new Date(p.createdAt), "dd/MM/yyyy"),
      p.productName || "",
      p.category || "",
      p.quantity || 0,
      p.packageQuantity && p.packageQuantity > 0 ? `${p.packageQuantity} ${p.packageType || 'emb.'}` : '-',
      Number(p.unitCost || 0).toFixed(2),
      Number(p.totalCost || 0).toFixed(2),
      p.supplier || "Não informado",
      p.notes || ""
    ])
  ];

  const fiadoData = [
    ["Cliente", "Telefone", "Dívida Atual (R$)"],
    ...data.customers.filter(c => c.totalDebt > 0).map(c => [c.name, c.phone || "", Number(c.totalDebt || 0).toFixed(2)])
  ];

  // 3. Update Sheets with data
  const updateReq = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      valueInputOption: "USER_ENTERED",
      data: [
        { range: "Vendas!A1", values: salesData },
        { range: "Compras!A1", values: purchasesData },
        { range: "Fiado!A1", values: fiadoData },
      ]
    })
  });

  if (!updateReq.ok) throw new Error("Failed to populate spreadsheet data.");

  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
}
