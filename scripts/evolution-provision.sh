#!/bin/sh
# Provisiona o Evolution automaticamente (idempotente): espera subir, cria a
# instância se faltar e aponta o webhook para a API. Roda uma vez no `compose up`.
set -eu

API="${EVOLUTION_API_URL:-http://evolution:8080}"
KEY="${EVOLUTION_API_KEY:-troque-em-dev}"
INST="${EVOLUTION_INSTANCE:-sales-hub}"
WHTOKEN="${EVOLUTION_WEBHOOK_TOKEN:-dev-webhook-token}"
WH_URL="${WEBHOOK_TARGET:-http://api-web:3311/webhook/evolution}?token=${WHTOKEN}"
# CONTACTS_UPSERT/UPDATE alimentam o nome salvo no aparelho; QRCODE_UPDATED/CONNECTION_UPDATE o status do pareamento.
EVENTS="${EVOLUTION_WEBHOOK_EVENTS:-\"MESSAGES_UPSERT\",\"MESSAGES_UPDATE\",\"SEND_MESSAGE\",\"CONNECTION_UPDATE\",\"QRCODE_UPDATED\",\"CONTACTS_UPSERT\",\"CONTACTS_UPDATE\"}"

echo "[provision] aguardando Evolution em $API ..."
i=0
until curl -fsS -o /dev/null "$API/"; do
  i=$((i + 1))
  [ "$i" -gt 60 ] && {
    echo "[provision] timeout esperando o Evolution"
    exit 1
  }
  sleep 2
done
echo "[provision] Evolution no ar."

# Cria a instância se ainda não existir (o create em instância existente é ignorado)
if curl -fsS -H "apikey: $KEY" "$API/instance/fetchInstances" | grep -q "$INST"; then
  echo "[provision] instância '$INST' já existe."
else
  echo "[provision] criando instância '$INST' ..."
  curl -fsS -X POST "$API/instance/create" \
    -H "apikey: $KEY" -H "content-type: application/json" \
    -d "{\"instanceName\":\"$INST\",\"integration\":\"WHATSAPP-BAILEYS\",\"qrcode\":true}" \
    >/dev/null 2>&1 || echo "[provision] (create retornou erro — provavelmente já existe, seguindo)"
  sleep 2
fi

echo "[provision] configurando webhook -> $WH_URL"
curl -fsS -X POST "$API/webhook/set/$INST" \
  -H "apikey: $KEY" -H "content-type: application/json" \
  -d "{\"webhook\":{\"enabled\":true,\"url\":\"$WH_URL\",\"headers\":{\"apikey\":\"$WHTOKEN\"},\"byEvents\":false,\"base64\":false,\"events\":[$EVENTS]}}" \
  >/dev/null

echo "[provision] OK. Pareie o WhatsApp no Manager:"
echo "[provision]   http://localhost:8080/manager   (apikey: $KEY, instância: $INST)"
