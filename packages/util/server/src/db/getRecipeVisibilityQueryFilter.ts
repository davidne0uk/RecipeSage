import { Prisma, ProfileItem } from "@recipesage/prisma";
import { prisma } from "@recipesage/prisma";
import { config } from "../general/config";
import { getFriendshipIds } from "./getFriendshipIds";

/**
 * Gets the Prisma filters that should be applied to get all recipes
 * a user can access given some parameters.
 * The result of this function should be ORd together
 */
export const getRecipeVisibilityQueryFilter = async (args: {
  tx?: Prisma.TransactionClient;
  userId?: string;
  userIds: string[];
  friendIds?: Set<string>;
}) => {
  const { tx = prisma, userId: contextUserId, userIds } = args;

  // Communal library: any signed in user can see every recipe on the instance,
  // so an unconstrained filter replaces the per-user sharing rules entirely.
  if (config.recipes.communalLibrary && contextUserId) {
    return [{}] satisfies Prisma.RecipeWhereInput[];
  }

  let friendIds: Set<string> = args.friendIds ?? new Set();
  if (contextUserId && !args.friendIds) {
    const friendships = await getFriendshipIds(contextUserId);
    friendIds = new Set(friendships.friends);
  }

  const friendUserIds = userIds.filter(
    (userId) => friendIds.has(userId) && userId !== contextUserId,
  );
  const nonFriendUserIds = userIds.filter(
    (userId) => !friendIds.has(userId) && userId !== contextUserId,
  );

  const profileItems = await tx.profileItem.findMany({
    where: {
      OR: [
        {
          userId: {
            in: friendUserIds,
          },
        },
        {
          userId: {
            in: nonFriendUserIds,
          },
          visibility: "public",
        },
      ],
    },
  });

  const profileItemsByUserId = profileItems.reduce(
    (acc, profileItem) => {
      acc[profileItem.userId] ??= [];
      acc[profileItem.userId].push(profileItem);
      return acc;
    },
    {} as { [key: string]: ProfileItem[] },
  );

  const allRecipesUserIds: string[] = [];
  const queryFilters: Prisma.RecipeWhereInput[] = [];
  for (const userId of userIds) {
    const isContextUser = contextUserId && userId === contextUserId;
    const profileItemsForUser = profileItemsByUserId[userId] || [];

    const isSharingAll = profileItemsForUser.find(
      (profileItem) => profileItem.type === "all-recipes",
    );

    if (isContextUser || isSharingAll) {
      allRecipesUserIds.push(userId);
      continue;
    }

    const sharedLabelIds = profileItemsForUser
      .filter((profileItem) => profileItem.type === "label")
      .map((profileItem) => profileItem.labelId)
      .filter((labelId): labelId is string => !!labelId);

    const sharedRecipeIds = profileItemsForUser
      .filter((profileItem) => profileItem.type === "recipe")
      .map((profileItem) => profileItem.recipeId)
      .filter((recipeId): recipeId is string => !!recipeId);

    const userOrFilters: Prisma.RecipeWhereInput[] = [];

    if (sharedLabelIds.length) {
      userOrFilters.push({
        recipeLabels: {
          some: {
            labelId: { in: sharedLabelIds },
          },
        },
      });
    }

    if (sharedRecipeIds.length) {
      userOrFilters.push({ id: { in: sharedRecipeIds } });
    }

    if (userOrFilters.length) {
      queryFilters.push({
        userId,
        OR: userOrFilters,
      });
    }
  }

  if (allRecipesUserIds.length) {
    queryFilters.push({ userId: { in: allRecipesUserIds } });
  }

  return queryFilters;
};
