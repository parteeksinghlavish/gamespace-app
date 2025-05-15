// Menu item type definitions
export type FoodVariant = {
  name: string;
  price: number;
};

export type FoodItem = {
  id: string;
  name: string;
  variants: FoodVariant[];
};

export type FoodCategory = {
  id: string;
  name: string;
  items: FoodItem[];
};

// Food menu data
export const foodMenu: FoodCategory[] = [
  {
    id: "pizza",
    name: "PIZZA",
    items: [
      {
        id: "margherita",
        name: "Margherita",
        variants: [
          { name: "Small", price: 119 },
          { name: "Medium", price: 199 },
          { name: "Large", price: 279 }
        ]
      },
      {
        id: "paneer-paradise",
        name: "Paneer Paradise",
        variants: [
          { name: "Small", price: 179 },
          { name: "Medium", price: 249 },
          { name: "Large", price: 339 }
        ]
      },
      {
        id: "classic-farmhouse",
        name: "Classic Farmhouse",
        variants: [
          { name: "Small", price: 179 },
          { name: "Medium", price: 249 },
          { name: "Large", price: 339 }
        ]
      },
      {
        id: "mexicana",
        name: "Mexicana",
        variants: [
          { name: "Small", price: 179 },
          { name: "Medium", price: 249 },
          { name: "Large", price: 339 }
        ]
      },
      {
        id: "bbq-veg",
        name: "BBQ Veg",
        variants: [
          { name: "Small", price: 169 },
          { name: "Medium", price: 239 },
          { name: "Large", price: 319 }
        ]
      },
      {
        id: "tandoori-paneer",
        name: "Tandoori Paneer",
        variants: [
          { name: "Small", price: 179 },
          { name: "Medium", price: 249 },
          { name: "Large", price: 339 }
        ]
      },
      {
        id: "makhni-special",
        name: "Makhni Special",
        variants: [
          { name: "Small", price: 179 },
          { name: "Medium", price: 249 },
          { name: "Large", price: 339 }
        ]
      },
      {
        id: "4-pizza-power-pack",
        name: "4-Pizza Power Pack",
        variants: [
          { name: "Small", price: 549 },
          { name: "Medium", price: 749 },
          { name: "Large", price: 999 }
        ]
      }
    ]
  },
  {
    id: "pasta",
    name: "PASTA",
    items: [
      {
        id: "red-sauce-pasta",
        name: "Red Sauce Pasta",
        variants: [
          { name: "Regular", price: 199 }
        ]
      },
      {
        id: "white-sauce-pasta",
        name: "White Sauce Pasta",
        variants: [
          { name: "Regular", price: 209 }
        ]
      },
      {
        id: "mix-sauce-pasta",
        name: "Mix Sauce Pasta",
        variants: [
          { name: "Regular", price: 219 }
        ]
      },
      {
        id: "exotic-veggie-pasta",
        name: "Exotic Veggie Pasta",
        variants: [
          { name: "Regular", price: 219 }
        ]
      }
    ]
  },
  {
    id: "burger-xp",
    name: "BURGER XP",
    items: [
      {
        id: "aloo-tikki-burger",
        name: "Aloo Tikki Burger",
        variants: [
          { name: "Regular", price: 69 }
        ]
      },
      {
        id: "aloo-cheese-burger",
        name: "Aloo Cheese Burger",
        variants: [
          { name: "Regular", price: 79 }
        ]
      },
      {
        id: "grilled-paneer-burger",
        name: "Grilled Paneer Burger",
        variants: [
          { name: "Regular", price: 109 }
        ]
      },
      {
        id: "cheese-burst-veg-burger",
        name: "Cheese Burst Veg Burger",
        variants: [
          { name: "Regular", price: 119 }
        ]
      }
    ]
  },
  {
    id: "sandwich-arena",
    name: "SANDWICH ARENA",
    items: [
      {
        id: "classic-club",
        name: "Classic Club",
        variants: [
          { name: "Regular", price: 89 }
        ]
      },
      {
        id: "spicy-corn-cheese",
        name: "Spicy Corn & Cheese",
        variants: [
          { name: "Regular", price: 109 }
        ]
      },
      {
        id: "mashroom-cheese",
        name: "Mashroom & Cheese",
        variants: [
          { name: "Regular", price: 129 }
        ]
      },
      {
        id: "tandoori-paneer-sandwich",
        name: "Tandoori Paneer",
        variants: [
          { name: "Regular", price: 129 }
        ]
      }
    ]
  },
  {
    id: "garlic-bread",
    name: "GARLIC BREAD",
    items: [
      {
        id: "plain-garlic-bread",
        name: "Plain Garlic Bread",
        variants: [
          { name: "Regular", price: 79 }
        ]
      },
      {
        id: "corn-cheese",
        name: "Corn & Cheese",
        variants: [
          { name: "Regular", price: 149 }
        ]
      },
      {
        id: "mexicana-garlic-bread",
        name: "Mexicana",
        variants: [
          { name: "Regular", price: 159 }
        ]
      },
      {
        id: "paneer-tikka",
        name: "Paneer Tikka",
        variants: [
          { name: "Regular", price: 169 }
        ]
      }
    ]
  },
  {
    id: "wraps-win",
    name: "WRAPS & WIN",
    items: [
      {
        id: "veg-wrap",
        name: "Veg Wrap",
        variants: [
          { name: "Regular", price: 99 }
        ]
      },
      {
        id: "mexican-wrap",
        name: "Mexican Wrap",
        variants: [
          { name: "Regular", price: 129 }
        ]
      },
      {
        id: "paneer-wrap",
        name: "Paneer Wrap",
        variants: [
          { name: "Regular", price: 139 }
        ]
      }
    ]
  },
  {
    id: "fries-frenzy",
    name: "FRIES FRENZY",
    items: [
      {
        id: "regular-fries",
        name: "Regular Fries",
        variants: [
          { name: "Regular", price: 79 }
        ]
      },
      {
        id: "peri-peri-fries",
        name: "Peri Peri Fries",
        variants: [
          { name: "Regular", price: 99 }
        ]
      },
      {
        id: "tandoori-masala-fries",
        name: "Tandoori Masala Fries",
        variants: [
          { name: "Regular", price: 99 }
        ]
      },
      {
        id: "crispy-cheesy-fries",
        name: "Crispy Cheesy Fries",
        variants: [
          { name: "Regular", price: 99 }
        ]
      },
      {
        id: "cheese-burst-fries",
        name: "Cheese Burst Fries",
        variants: [
          { name: "Regular", price: 129 }
        ]
      },
      {
        id: "pizza-fries",
        name: "Pizza Fries",
        variants: [
          { name: "Regular", price: 139 }
        ]
      }
    ]
  },
  {
    id: "starters",
    name: "STARTERS",
    items: [
      {
        id: "potato-cheese-bites",
        name: "Potato Cheese Bites",
        variants: [
          { name: "Regular", price: 119 }
        ]
      },
      {
        id: "cheese-corn-triangles",
        name: "Cheese Corn Triangles",
        variants: [
          { name: "Regular", price: 139 }
        ]
      },
      {
        id: "veggie-fingers",
        name: "Veggie Fingers",
        variants: [
          { name: "Regular", price: 129 }
        ]
      },
      {
        id: "chilli-cheese-nuggets",
        name: "Chilli Cheese Nuggets",
        variants: [
          { name: "Regular", price: 139 }
        ]
      },
      {
        id: "onion-rings",
        name: "Onion Rings",
        variants: [
          { name: "Regular", price: 129 }
        ]
      },
      {
        id: "mini-cheese-corn-samosa",
        name: "Mini Cheese Corn Samosa",
        variants: [
          { name: "Regular", price: 129 }
        ]
      }
    ]
  },
  {
    id: "maggi-mana",
    name: "MAGGI MANA",
    items: [
      {
        id: "plain-maggi",
        name: "Plain Maggi",
        variants: [
          { name: "Regular", price: 69 }
        ]
      },
      {
        id: "spicy-masala-maggi",
        name: "Spicy Masala Maggi",
        variants: [
          { name: "Regular", price: 79 }
        ]
      },
      {
        id: "special-veg-maggi",
        name: "Special Veg Maggi",
        variants: [
          { name: "Regular", price: 89 }
        ]
      },
      {
        id: "cheese-burst-maggi",
        name: "Cheese Burst Maggi",
        variants: [
          { name: "Regular", price: 109 }
        ]
      },
      {
        id: "paneer-masala-maggi",
        name: "Paneer Masala Maggi",
        variants: [
          { name: "Regular", price: 119 }
        ]
      }
    ]
  },
  {
    id: "nachos-fiesta",
    name: "NACHOS FIESTA",
    items: [
      {
        id: "classic-veg",
        name: "Classic Veg",
        variants: [
          { name: "Regular", price: 119 }
        ]
      },
      {
        id: "cheese-overload",
        name: "Cheese Overload",
        variants: [
          { name: "Regular", price: 139 }
        ]
      },
      {
        id: "mexican-spicy",
        name: "Mexican Spicy",
        variants: [
          { name: "Regular", price: 139 }
        ]
      },
      {
        id: "tandoori-paneer-nachos",
        name: "Tandoori Paneer",
        variants: [
          { name: "Regular", price: 149 }
        ]
      }
    ]
  },
  {
    id: "coffee",
    name: "COFFEE",
    items: [
      {
        id: "espresso",
        name: "Espresso",
        variants: [
          { name: "Regular", price: 89 }
        ]
      },
      {
        id: "americano",
        name: "Americano",
        variants: [
          { name: "Regular", price: 99 }
        ]
      },
      {
        id: "cappuccino",
        name: "Cappuccino",
        variants: [
          { name: "Regular", price: 129 }
        ]
      },
      {
        id: "cafe-latte",
        name: "Cafe Latte",
        variants: [
          { name: "Regular", price: 129 }
        ]
      },
      {
        id: "cafe-mocha",
        name: "Cafe Mocha",
        variants: [
          { name: "Regular", price: 149 }
        ]
      },
      {
        id: "hot-chocolate",
        name: "Hot Chocolate",
        variants: [
          { name: "Regular", price: 149 }
        ]
      }
    ]
  },
  {
    id: "cold-coffee",
    name: "COLD COFFEE",
    items: [
      {
        id: "cold-coffee",
        name: "Cold Coffee",
        variants: [
          { name: "Regular", price: 119 }
        ]
      },
      {
        id: "cafe-frappe",
        name: "Cafe Frappe",
        variants: [
          { name: "Regular", price: 129 }
        ]
      },
      {
        id: "iced-cafe-latte",
        name: "Iced Cafe Latte",
        variants: [
          { name: "Regular", price: 119 }
        ]
      },
      {
        id: "iced-espresso-coffee",
        name: "Iced Espresso Coffee",
        variants: [
          { name: "Regular", price: 139 }
        ]
      },
      {
        id: "mocha-frappe",
        name: "Mocha Frappe",
        variants: [
          { name: "Regular", price: 149 }
        ]
      },
      {
        id: "oreo-frappe-cold-coffee",
        name: "Oreo Frappe Cold Coffee",
        variants: [
          { name: "Regular", price: 169 }
        ]
      }
    ]
  },
  {
    id: "shakes",
    name: "SHAKES",
    items: [
      {
        id: "vanilla-shake",
        name: "Vanilla Shake",
        variants: [
          { name: "Regular", price: 129 }
        ]
      },
      {
        id: "blackcurrant-shake",
        name: "Blackcurrant Shake",
        variants: [
          { name: "Regular", price: 139 }
        ]
      },
      {
        id: "blueberry-shake",
        name: "Blueberry Shake",
        variants: [
          { name: "Regular", price: 139 }
        ]
      },
      {
        id: "butterscotch-shake",
        name: "Butterscotch Shake",
        variants: [
          { name: "Regular", price: 139 }
        ]
      },
      {
        id: "caramel-shake",
        name: "Caramel Shake",
        variants: [
          { name: "Regular", price: 139 }
        ]
      },
      {
        id: "kit-kat-shake",
        name: "Kit Kat Shake",
        variants: [
          { name: "Regular", price: 149 }
        ]
      },
      {
        id: "mango-shake",
        name: "Mango Shake",
        variants: [
          { name: "Regular", price: 139 }
        ]
      },
      {
        id: "oreo-shake",
        name: "Oreo Shake",
        variants: [
          { name: "Regular", price: 149 }
        ]
      },
      {
        id: "strawberry-shake",
        name: "Strawberry Shake",
        variants: [
          { name: "Regular", price: 139 }
        ]
      },
      {
        id: "chocolate-shake",
        name: "Chocolate Shake",
        variants: [
          { name: "Regular", price: 149 }
        ]
      },
      {
        id: "banana-shake",
        name: "Banana Shake",
        variants: [
          { name: "Regular", price: 129 }
        ]
      }
    ]
  },
  {
    id: "mocktails",
    name: "MOCKTAILS",
    items: [
      {
        id: "fresh-lime-soda",
        name: "Fresh Lime Soda",
        variants: [
          { name: "Regular", price: 79 }
        ]
      },
      {
        id: "masala-lemon-soda",
        name: "Masala Lemon Soda",
        variants: [
          { name: "Regular", price: 79 }
        ]
      },
      {
        id: "classic-mojito",
        name: "Classic Mojito",
        variants: [
          { name: "Regular", price: 89 }
        ]
      },
      {
        id: "green-apple-mojito",
        name: "Green Apple Mojito",
        variants: [
          { name: "Regular", price: 99 }
        ]
      },
      {
        id: "strawberry-mojito",
        name: "Strawberry Mojito",
        variants: [
          { name: "Regular", price: 99 }
        ]
      },
      {
        id: "watermelon-mojito",
        name: "Watermelon Mojito",
        variants: [
          { name: "Regular", price: 99 }
        ]
      },
      {
        id: "blue-shock-mojito",
        name: "Blue Shock Mojito",
        variants: [
          { name: "Regular", price: 99 }
        ]
      }
    ]
  },
  {
    id: "soft-drinks",
    name: "SOFT DRINKS",
    items: [
      {
        id: "sprite-can",
        name: "Sprite Can",
        variants: [
          { name: "Regular", price: 70 }
        ]
      },
      {
        id: "coca-cola-can",
        name: "Coca-Cola Can",
        variants: [
          { name: "Regular", price: 70 }
        ]
      },
      {
        id: "thumbs-up-can",
        name: "Thumbs Up Can",
        variants: [
          { name: "Regular", price: 70 }
        ]
      },
      {
        id: "predator",
        name: "Predator",
        variants: [
          { name: "Regular", price: 60 }
        ]
      },
      {
        id: "monster-can",
        name: "Monster Can",
        variants: [
          { name: "Regular", price: 125 }
        ]
      },
      {
        id: "red-bull-can",
        name: "Red Bull Can",
        variants: [
          { name: "Regular", price: 125 }
        ]
      },
      {
        id: "water-bottle",
        name: "Water Bottle",
        variants: [
          { name: "Regular", price: 20 }
        ]
      }
    ]
  },
  {
    id: "hot-tea",
    name: "HOT TEA",
    items: [
      {
        id: "masala-tea",
        name: "Masala Tea",
        variants: [
          { name: "Regular", price: 50 }
        ]
      },
      {
        id: "ginger-tea",
        name: "Ginger Tea",
        variants: [
          { name: "Regular", price: 50 }
        ]
      },
      {
        id: "healthy-green-tea",
        name: "Healthy Green Tea",
        variants: [
          { name: "Regular", price: 60 }
        ]
      }
    ]
  },
  {
    id: "iced-tea",
    name: "ICED TEA",
    items: [
      {
        id: "classic-lemon-iced-tea",
        name: "Classic Lemon Iced Tea",
        variants: [
          { name: "Regular", price: 79 }
        ]
      },
      {
        id: "peach-iced-tea",
        name: "Peach Iced Tea",
        variants: [
          { name: "Regular", price: 89 }
        ]
      },
      {
        id: "green-apple-iced-tea",
        name: "Green Apple Iced Tea",
        variants: [
          { name: "Regular", price: 89 }
        ]
      },
      {
        id: "strawberry-iced-tea",
        name: "Strawberry Iced Tea",
        variants: [
          { name: "Regular", price: 89 }
        ]
      },
      {
        id: "watermelon-iced-tea",
        name: "Watermelon Iced Tea",
        variants: [
          { name: "Regular", price: 99 }
        ]
      },
      {
        id: "mint-iced-tea",
        name: "Mint Iced Tea",
        variants: [
          { name: "Regular", price: 79 }
        ]
      }
    ]
  },
  {
    id: "ice-cream-scoops",
    name: "ICE CREAM SCOOPS",
    items: [
      {
        id: "belgian-chocolate",
        name: "Belgian Chocolate",
        variants: [
          { name: "Single", price: 69 },
          { name: "Double", price: 129 }
        ]
      },
      {
        id: "crunchy-butterscotch",
        name: "Crunchy Butterscotch",
        variants: [
          { name: "Single", price: 69 },
          { name: "Double", price: 129 }
        ]
      },
      {
        id: "french-vanilla",
        name: "French Vanilla",
        variants: [
          { name: "Single", price: 69 },
          { name: "Double", price: 129 }
        ]
      },
      {
        id: "mango-ice-cream",
        name: "Mango",
        variants: [
          { name: "Single", price: 79 },
          { name: "Double", price: 139 }
        ]
      },
      {
        id: "tutti-frutti",
        name: "Tutti Frutti",
        variants: [
          { name: "Single", price: 79 },
          { name: "Double", price: 139 }
        ]
      },
      {
        id: "rajbhog",
        name: "Rajbhog",
        variants: [
          { name: "Single", price: 89 },
          { name: "Double", price: 149 }
        ]
      },
      {
        id: "kesar-pista",
        name: "Kesar Pista",
        variants: [
          { name: "Single", price: 89 },
          { name: "Double", price: 149 }
        ]
      },
      {
        id: "shahi-kulfi",
        name: "Shahi Kulfi",
        variants: [
          { name: "Single", price: 89 },
          { name: "Double", price: 149 }
        ]
      }
    ]
  },
  {
    id: "kwality-walls",
    name: "KWALITY WALLS",
    items: [
      {
        id: "cornetto-oreo",
        name: "Cornetto Oreo",
        variants: [
          { name: "Regular", price: 60 }
        ]
      },
      {
        id: "cornetto-choco-brownie",
        name: "Cornetto Choco Brownie",
        variants: [
          { name: "Regular", price: 60 }
        ]
      },
      {
        id: "cornetto-vanilla",
        name: "Cornetto Vanilla",
        variants: [
          { name: "Regular", price: 30 }
        ]
      },
      {
        id: "cornetto-double-chocolate",
        name: "Cornetto Double Chocolate",
        variants: [
          { name: "Regular", price: 40 }
        ]
      },
      {
        id: "cornetto-butter",
        name: "Cornetto Butter",
        variants: [
          { name: "Regular", price: 45 }
        ]
      },
      {
        id: "choco-tastic-sundae",
        name: "Choco Tastic Sundae",
        variants: [
          { name: "Regular", price: 35 }
        ]
      },
      {
        id: "cup-trixy-cheese-cake",
        name: "Cup Trixy Cheese Cake",
        variants: [
          { name: "Regular", price: 70 }
        ]
      },
      {
        id: "cup-trix-cookie",
        name: "Cup Trix Cookie",
        variants: [
          { name: "Regular", price: 70 }
        ]
      },
      {
        id: "cup-divine-choco-chip",
        name: "Cup Divine Choco Chip",
        variants: [
          { name: "Regular", price: 50 }
        ]
      }
    ]
  }
];

// Helper function to get all categories
export function getAllCategories(): FoodCategory[] {
  return foodMenu;
}

// Helper function to get all items in a category
export function getItemsByCategory(categoryId: string): FoodItem[] {
  const category = foodMenu.find(cat => cat.id === categoryId);
  return category ? category.items : [];
}

// Helper function to get a specific item
export function getItem(categoryId: string, itemId: string): FoodItem | undefined {
  const category = foodMenu.find(cat => cat.id === categoryId);
  return category?.items.find(item => item.id === itemId);
}

// Helper function to get a specific variant price
export function getVariantPrice(categoryId: string, itemId: string, variantName: string): number {
  const item = getItem(categoryId, itemId);
  const variant = item?.variants.find(v => v.name === variantName);
  return variant?.price || 0;
} 