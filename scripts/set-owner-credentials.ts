/**
 * scripts/set-owner-credentials.ts — définit les identifiants du compte propriétaire.
 *
 * Usage (le secret transite par variable d'environnement, jamais écrit dans le dépôt) :
 *   OWNER_EMAIL="vous@exemple.com" OWNER_PASSWORD="********" bun run scripts/set-owner-credentials.ts
 *
 * Idempotent : met à jour le profil portant le rôle `owner` (e-mail, hachage de mot de
 * passe, réactivation). À relancer après un éventuel `db:seed` qui recrée les comptes
 * de démonstration. Le mot de passe n'est ni journalisé ni persisté en clair.
 */
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/auth";

const db = new PrismaClient();

async function main() {
  const email = (process.env.OWNER_EMAIL || "").trim().toLowerCase();
  const password = process.env.OWNER_PASSWORD || "";

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error("✗ OWNER_EMAIL invalide ou manquant.");
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("✗ OWNER_PASSWORD requis (8 caractères minimum).");
    process.exit(1);
  }

  const owner = await db.profile.findFirst({ where: { role: "owner" } });
  if (!owner) {
    console.error("✗ Aucun profil avec le rôle « owner » trouvé en base.");
    process.exit(1);
  }

  await db.profile.update({
    where: { id: owner.id },
    data: { email, passwordHash: hashPassword(password), isActive: true },
  });

  console.log(`✓ Compte propriétaire mis à jour → ${email} (rôle owner, actif).`);
  await db.$disconnect();
}

main().catch((e) => {
  console.error("✗ Échec :", e instanceof Error ? e.message : e);
  process.exit(1);
});
