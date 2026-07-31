#!/usr/bin/env bash
# =============================================================================
# TradingCorp — Cohérence entre les migrations versionnées et la base réelle
#
# Le dépôt et la base avaient divergé sans que rien ne le signale : 29 fichiers
# pour 12 lignes enregistrées, des horodatages différents, une migration en
# production sans fichier source, et une migration de sécurité jamais appliquée
# (audit du 31/07/2026, P-01 et P-02). Ce script est le garde-fou qui rend cette
# dérive impossible à répéter en silence.
#
# Usage local :
#   SUPABASE_DB_URL="postgresql://…" ./supabase/verifier-migrations.sh
#
# L'URL de connexion se récupère dans le tableau de bord Supabase
# (Project Settings → Database → Connection string). Ne jamais la committer.
# =============================================================================
set -uo pipefail

DOSSIER="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/migrations"

if [ -z "${SUPABASE_DB_URL:-}" ]; then
  echo "⏭  SUPABASE_DB_URL absent — vérification ignorée."
  echo "   (Renseigner le secret pour activer le contrôle.)"
  exit 0
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "✖  psql introuvable — impossible de vérifier."
  exit 1
fi

# Versions présentes dans le dépôt : préfixe horodaté du nom de fichier.
fichiers=$(find "$DOSSIER" -maxdepth 1 -name '*.sql' -exec basename {} \; \
           | sed 's/_.*//' | sort -u)

# Versions enregistrées comme appliquées en base.
base=$(psql "$SUPABASE_DB_URL" -Atc \
       "select version from supabase_migrations.schema_migrations order by version") || {
  echo "✖  Connexion à la base impossible."
  exit 1
}

manquantes_en_base=$(comm -23 <(echo "$fichiers") <(echo "$base"))
manquantes_au_depot=$(comm -13 <(echo "$fichiers") <(echo "$base"))

statut=0

if [ -n "$manquantes_en_base" ]; then
  statut=1
  echo "✖  Fichiers de migration NON appliqués en base :"
  echo "$manquantes_en_base" | sed 's/^/     /'
  echo "   → appliquer la migration, ou la retirer du dépôt si elle est caduque."
fi

if [ -n "$manquantes_au_depot" ]; then
  statut=1
  echo "✖  Migrations appliquées en base SANS fichier source dans le dépôt :"
  echo "$manquantes_au_depot" | sed 's/^/     /'
  echo "   → reconstituer le fichier depuis"
  echo "     supabase_migrations.schema_migrations.statements, qui conserve le"
  echo "     SQL réellement exécuté."
fi

if [ "$statut" -eq 0 ]; then
  echo "✔  Migrations cohérentes — $(echo "$fichiers" | wc -l | tr -d ' ') versions alignées entre le dépôt et la base."
fi

exit "$statut"
