export type Category = {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
};

export type Product = {
  id: string;
  name: string;
  slug: string;
  description: string;
  price: string;
  stock: number;
  imageUrl: string | null;
  categoryId: string;
  createdAt: string;
  updatedAt: string;
  category: Category;
  averageRating?: number;
  reviewCount?: number;
};

export type ProductSort = 'newest' | 'price_asc' | 'price_desc' | 'rating_desc';

export type Review = {
  id: string;
  rating: number;
  comment: string | null;
  author: { id: string; name: string };
  createdAt: string;
  updatedAt: string;
};

export type ReviewListResponse = {
  items: Review[];
  total: number;
  page: number;
  limit: number;
  summary: {
    averageRating: number;
    reviewCount: number;
    distribution: Record<'1' | '2' | '3' | '4' | '5', number>;
  };
};

export type ProductListResponse = {
  items: Product[];
  total: number;
  page: number;
  limit: number;
};
