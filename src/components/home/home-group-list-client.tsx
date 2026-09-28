"use client";

import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { GroupListQueryResult } from "@/sanity.types";
import { ChevronDownIcon } from "@radix-ui/react-icons";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { DEFAULT_FILTER_VALUE } from "../shared/combobox";

export type HomeGroupListClientProps = {
  groupList: GroupListQueryResult;
  urlPrefix: string;
};

export function HomeGroupListClient({
  groupList,
  urlPrefix,
}: HomeGroupListClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedCategory = searchParams.get("category") || DEFAULT_FILTER_VALUE;
  const [openCategories, setOpenCategories] = useState<Set<string>>(
    () => new Set(groupList.map((group) => group.slug.current)),
  );

  useEffect(() => {
    if (!selectedCategory || selectedCategory === DEFAULT_FILTER_VALUE) {
      return;
    }

    const parentCategory = groupList.find((group) =>
      group.categories.some(
        (category) => category.slug?.current === selectedCategory,
      ),
    );

    if (parentCategory) {
      setOpenCategories((previous) => {
        if (previous.has(parentCategory.slug.current)) return previous;
        const next = new Set(previous);
        next.add(parentCategory.slug.current);
        return next;
      });
    }
  }, [selectedCategory, groupList]);

  const categoryFilterItemList = [
    { value: DEFAULT_FILTER_VALUE, label: "All Categories", subCategories: [] },
    ...groupList.map((item) => ({
      value: item.slug.current,
      label: item.name,
      subCategories:
        item.categories.map((category) => ({
          _id: category._id,
          title: category.name || "",
          slug: category.slug?.current || "",
        })) || [],
    })),
  ];

  const handleFilterChange = (
    type: string,
    value: string,
    isSubCategory = false,
  ) => {
    if (!isSubCategory && value !== DEFAULT_FILTER_VALUE) {
      return;
    }

    const newParams = new URLSearchParams(window.location.search);
    if (value === null || value === DEFAULT_FILTER_VALUE) {
      newParams.delete(type);
    } else {
      newParams.set(type, value);
    }
    newParams.delete("page");
    router.push(`${urlPrefix}?${newParams.toString()}`);
  };

  const setCategoryOpen = (categoryValue: string, open: boolean) => {
    setOpenCategories((previous) => {
      const next = new Set(previous);
      if (open) next.add(categoryValue);
      else next.delete(categoryValue);
      return next;
    });
  };

  return (
    <div className="hidden md:flex border rounded-lg p-4">
      <ul className="flex flex-col gap-y-2 w-full">
        {categoryFilterItemList.map((item) => {
          const isOpen = openCategories.has(item.value);
          const isAllCategories = item.value === DEFAULT_FILTER_VALUE;

          if (isAllCategories) {
            return (
              <li key={item.value}>
                <Button
                  variant={
                    item.value === selectedCategory ? "default" : "ghost"
                  }
                  size="sm"
                  className="w-full justify-start"
                  onClick={() => handleFilterChange("category", item.value)}
                >
                  {item.label}
                </Button>
              </li>
            );
          }

          return (
            <Collapsible
              asChild
              key={item.value}
              open={isOpen}
              onOpenChange={(open) => setCategoryOpen(item.value, open)}
              className="w-full space-y-2"
            >
              <li>
                <CollapsibleTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-auto w-full px-3 py-2 justify-between whitespace-normal text-left"
                  >
                    <span>{item.label}</span>
                    {item.subCategories.length > 0 && (
                      <ChevronDownIcon
                        className={`h-4 w-4 shrink-0 transition-transform duration-200 ${
                          isOpen ? "transform rotate-180" : ""
                        }`}
                      />
                    )}
                  </Button>
                </CollapsibleTrigger>
                {item.subCategories.length > 0 && (
                  <CollapsibleContent className="space-y-2">
                    {item.subCategories.map((subCategory) => (
                      <Button
                        key={subCategory._id}
                        variant={
                          subCategory.slug === selectedCategory
                            ? "default"
                            : "ghost"
                        }
                        size="sm"
                        className="h-auto w-full px-6 py-2 justify-start whitespace-normal text-left"
                        onClick={() =>
                          handleFilterChange("category", subCategory.slug, true)
                        }
                      >
                        {subCategory.title}
                      </Button>
                    ))}
                  </CollapsibleContent>
                )}
              </li>
            </Collapsible>
          );
        })}
      </ul>
    </div>
  );
}
