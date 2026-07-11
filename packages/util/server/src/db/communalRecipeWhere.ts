import { config } from "../general/config";

/**
 * Scopes a targeted recipe mutation to the recipes the caller may act on.
 *
 * Normally a user may only mutate their own recipes, so the owner is part of
 * the where clause. When the communal library is enabled every signed in user
 * may edit and delete every recipe on the instance, so the owner predicate is
 * dropped and only the recipe id(s) constrain the mutation.
 *
 * Note this deliberately does not apply to the self scoped bulk operations
 * (deleteAllRecipes, deleteRecipesByLabelIds) - those always remain owned by
 * the caller so that no single call can wipe the shared library.
 */
export const communalRecipeWhere = <T extends object>(
  userId: string,
  where: T,
): T & { userId?: string } => {
  if (config.recipes.communalLibrary) return where;

  return {
    ...where,
    userId,
  };
};
