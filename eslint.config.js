// @ts-check
const eslint = require('@eslint/js');
const { defineConfig } = require('eslint/config');
const tseslint = require('typescript-eslint');
const angular = require('angular-eslint');

module.exports = defineConfig([
  {
    // Fichier GÉNÉRÉ depuis le schéma PostgreSQL (`npm run types:generate`).
    // Le corriger pour satisfaire le style ne servirait à rien : la
    // régénération suivante réintroduirait les mêmes écarts. On le laisse tel
    // que l'outil le produit, ce qui garde le diff lisible d'une fois sur
    // l'autre.
    ignores: ['src/app/core/supabase/database.types.ts'],
  },
  {
    files: ['**/*.ts'],
    extends: [
      eslint.configs.recommended,
      tseslint.configs.recommended,
      tseslint.configs.stylistic,
      angular.configs.tsRecommended,
    ],
    processor: angular.processInlineTemplates,
    rules: {
      '@angular-eslint/directive-selector': [
        'error',
        {
          type: 'attribute',
          prefix: 'app',
          style: 'camelCase',
        },
      ],
      '@angular-eslint/component-selector': [
        'error',
        {
          type: 'element',
          prefix: 'app',
          style: 'kebab-case',
        },
      ],

      // Le client Supabase rend `{ data, error }` sans jamais lever
      // d'exception : l'atteindre en direct, c'est pouvoir ignorer `error` —
      // ce que faisaient 30 appels sur 44, transformant chaque panne en
      // « aucune donnée ». `AccesDonnees` inspecte l'erreur à chaque fois ;
      // cette règle est ce qui garantit qu'on y passe, plutôt que la
      // vigilance de qui écrira le prochain service.
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@supabase/supabase-js',
              importNames: ['SupabaseClient'],
              message:
                'Passe par AccesDonnees (core/supabase/acces-donnees) : il traite les erreurs.',
            },
          ],
          patterns: [
            {
              group: ['**/supabase/supabase.client'],
              message:
                'Passe par AccesDonnees (core/supabase/acces-donnees) : il traite les erreurs.',
            },
          ],
        },
      ],
    },
  },

  // Les seuls fichiers autorisés à toucher le client brut : la couche d'accès
  // elle-même, l'authentification (qui n'est pas du PostgREST et traite déjà
  // ses erreurs), et les tests, qui ont besoin d'en fournir un double.
  {
    files: [
      'src/app/core/supabase/supabase.client.ts',
      'src/app/core/supabase/acces-donnees.ts',
      'src/app/core/auth/auth.service.ts',
      '**/*.spec.ts',
    ],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
  {
    files: ['**/*.html'],
    extends: [angular.configs.templateRecommended, angular.configs.templateAccessibility],
    rules: {},
  },
]);
