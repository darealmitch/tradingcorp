# Gabarits des e-mails d'authentification

Ces fichiers sont la **source** des e-mails envoyés par Supabase Auth. Ils ne
sont pas lus par l'application : Supabase les stocke dans son tableau de bord,
hors du dépôt. On les garde ici parce qu'un contenu qui n'existe que dans une
interface distante finit par diverger de ce que l'équipe croit avoir écrit — et
parce qu'un gabarit se relit en revue de code, pas dans un formulaire.

## Où les coller

Supabase → **Authentication** → **Emails** → onglet **Templates**, puis pour
chacun : coller le HTML, et remplacer l'objet.

| Fichier                              | Gabarit Supabase     | Objet                        |
| ------------------------------------ | -------------------- | ---------------------------- |
| `reinitialisation-mot-de-passe.html` | Reset Password       | Ton code de réinitialisation |
| `invitation.html`                    | Invite user          | Ton accès à TradingCorp      |
| `confirmation-inscription.html`      | Confirm signup       | Confirme ton adresse e-mail  |
| `changement-email.html`              | Change Email Address | Confirme ta nouvelle adresse |

`Magic Link` et `Reauthentication` ne sont pas fournis : l'application n'utilise
ni la connexion par lien, ni la ré-authentification.

## Un code, pas un lien, pour la réinitialisation

Ce gabarit-là ne contient **aucun lien** : il affiche `{{ .Token }}`, le code à
six chiffres, que la personne recopie sur le site.

La raison est technique et sans échappatoire. Le client Supabase est configuré
en `pkce` — nécessaire au retour de la connexion Google. Dans ce mode, la
demande de réinitialisation dépose un secret dans le navigateur, et le lien reçu
**ne vaut que dans ce navigateur**. Faire sa demande sur un ordinateur puis
ouvrir l'e-mail sur son téléphone — le geste le plus banal qui soit — menait à
un lien mort, sans explication utile.

Deux bénéfices en prime : l'e-mail ne porte plus l'adresse technique du projet
Supabase, que le destinataire voyait au survol du lien ; et le réglage
`redirect_to` n'entre plus en jeu, donc plus de risque d'atterrir sur la racine
du site au lieu de la page attendue.

Les trois autres gabarits gardent leur lien : ils ouvrent une session, pas une
réinitialisation, et le parcours se déroule dans le navigateur qui reçoit.

## Ce qui structure ces gabarits

**Un en-tête blanc, sous une bande d'accent.** Le premier jet posait le logo
sur un bandeau `#05060b`, pour le raisonnement suivant : « TRADING » est dessiné
en dégradé gris-vers-blanc, il s'effacerait sur fond clair. Le raisonnement
était juste, la prémisse fausse — `tradingCorp.png` **porte son propre fond
blanc opaque** : aucun pixel transparent sur 374 715, les quatre coins à
`#ffffff`. Le bandeau sombre n'entourait donc pas le logo, il entourait un
grand rectangle blanc. L'en-tête est passé en blanc, ce que le logo attend, et
la couleur de marque tient dans une bande de 4 px au-dessus.

Si un jour le logo est détouré, le bandeau sombre redevient possible — mais
c'est le fichier qu'il faut corriger d'abord, pas le gabarit.

**Des tables et des styles en ligne.** Ce n'est pas de la nostalgie : les
clients de messagerie ignorent les feuilles de style externes, et plusieurs
ignorent encore `flex` et `grid`.

**Le lien en clair sous le bouton.** Des clients suppriment les boutons, des
passerelles d'entreprise réécrivent les liens. Sans ce repli, un destinataire
peut se retrouver devant un message dont l'action est inatteignable.

**Un préheader.** La ligne affichée dans la liste des messages, avant
l'ouverture. Sans elle, la messagerie y affiche le premier texte trouvé — ici,
« TradingCorp », le texte alternatif du logo.

**Le tutoiement**, comme partout ailleurs sur le site.

## Une limite à connaître

`{{ .ConfirmationURL }}` pointe vers l'adresse déclarée dans
**Authentication → URL Configuration**. Un gabarit impeccable renverra vers une
mauvaise adresse si ce réglage est faux : les deux se vérifient ensemble.
