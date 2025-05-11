import { StoriesListItem, StoryTemplate, User } from "core/types";
import { apiClient } from "shared/apiClient";

// Admin Story API functions
export const adminStoryApi = {
  getStories: async (): Promise<StoriesListItem[]> => {
    return apiClient
      .get<{ stories: StoriesListItem[] }>(`/admin/stories`)
      .then((response) => response.stories);
  },

  deleteStory: async (storyId: string): Promise<void> => {
    return apiClient.delete(`/admin/stories/${storyId}`);
  },
};

// Admin Template API functions
export const adminTemplateApi = {
  getTemplates: async (): Promise<StoryTemplate[]> => {
    return apiClient
      .get<{ templates: StoryTemplate[] }>(`/admin/templates`)
      .then((response) => response.templates);
  },

  getTemplate: async (templateId: string): Promise<StoryTemplate> => {
    return apiClient
      .get<{ template: StoryTemplate }>(`/admin/templates/${templateId}`)
      .then((response) => response.template);
  },
};

export const adminUsersApi = {
  getUsers: async (): Promise<User[]> => {
    return apiClient
      .get<{ users: User[] }>(`/admin/users`)
      .then((response) => response.users);
  },
};
