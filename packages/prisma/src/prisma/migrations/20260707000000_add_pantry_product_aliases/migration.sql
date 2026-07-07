-- CreateTable
CREATE TABLE "Pantry_Product_Aliases" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "ingredientText" TEXT NOT NULL,
    "grocyProductId" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Pantry_Product_Aliases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Pantry_Product_Aliases_userId_ingredientText_uk" ON "Pantry_Product_Aliases"("userId", "ingredientText");

-- AddForeignKey
ALTER TABLE "Pantry_Product_Aliases" ADD CONSTRAINT "Pantry_Product_Aliases_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
