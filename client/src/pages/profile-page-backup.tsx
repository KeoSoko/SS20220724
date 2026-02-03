import React, { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { PageLayout } from '@/components/page-layout';
import { ContentCard, Section, PrimaryButton, StatusBadge } from '@/components/design-system';
import { BackButton } from '@/components/back-button';
import { useIsMobile } from '@/hooks/use-mobile';
import { useToast } from '@/hooks/use-toast';
import { User, Mail, Phone, Shield, Edit2, Check, X, Camera, Key } from 'lucide-react';
import { MobileBottomNav } from '@/components/mobile-bottom-nav';

// Enhanced profile update schema
const profileFormSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters").max(50, "Username must be less than 50 characters"),
  displayName: z.string().min(1, "Display name is required").max(100, "Display name must be less than 100 characters"),
  email: z.string().email("Please enter a valid email address"),
  phoneNumber: z.string().optional(),
  gender: z.string().optional(),
  address: z.string().optional(),
  birthdate: z.string().optional(),
  profilePicture: z.string().optional(),
});

type ProfileFormValues = z.infer<typeof profileFormSchema>;

export default function ProfilePage() {
  const [_, navigate] = useLocation();
  const { user, invalidateTokensMutation } = useAuth();
  const [editingField, setEditingField] = useState<string | null>(null);
  const [emailVerificationSent, setEmailVerificationSent] = useState(false);
  const isMobile = useIsMobile();
  const { toast } = useToast();
  
  // Create form with enhanced fields
  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      username: user?.username || '',
      displayName: user?.fullName || user?.username || '',
      email: user?.email || '',
      gender: user?.gender || '',
      phoneNumber: user?.phoneNumber || '',
      address: user?.address || '',
      birthdate: user?.birthdate || '',
    },
  });
  
  // Effect to reset form values when user changes
  useEffect(() => {
    if (user) {
      form.reset({
        username: user.username || '',
        displayName: user.fullName || user.username || '',
        email: user.email || '',
        birthdate: user.birthdate || '',
        gender: user.gender || '',
        phoneNumber: user.phoneNumber || '',
        address: user.address || '',
      });
    }
  }, [user, form]);

  // Mutation for updating profile
  const updateProfileMutation = useMutation({
    mutationFn: async (data: ProfileFormValues) => {
      const res = await apiRequest('PATCH', `/api/user/${user?.id}`, data);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/user'] });
      setEditingField(null);
    },
  });

  // Handle form submission
  const onSubmit = (data: ProfileFormValues) => {
    updateProfileMutation.mutate(data);
  };

  // Handle field editing
  const startEditing = (field: string) => {
    setEditingField(field);
  };

  // Cancel editing
  const cancelEditing = () => {
    setEditingField(null);
    form.reset();
  };

  // Get the first letter of the name for avatar fallback
  const getNameInitials = () => {
    const name = user?.fullName || user?.username || '';
    return name.charAt(0).toUpperCase();
  };

  // Add debug output
  console.log("ProfilePage: user=", user);
  
  if (!user) {
    return (
      <div className="min-h-screen bg-[#0073AA] p-6 flex items-center justify-center pb-20">
        <div className="text-white text-center">
          <h2 className="text-xl mb-4">Loading Profile...</h2>
          <p>Please wait or try signing in again</p>
          <Button 
            className="mt-4 bg-white text-[#0073AA] hover:bg-gray-100 rounded-none font-semibold"
            onClick={() => navigate('/simple-auth')}
          >
            Return to Login
          </Button>
          
          {/* Add mobile bottom navigation */}
          {isMobile && <MobileBottomNav />}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0073AA] pb-20">
      {/* Header */}
      <div className="pt-6 px-4 flex items-center">
        <BackButton fallbackPath="/home" />
        <h1 className="text-xl font-semibold text-white text-center flex-1 mr-8">
          MY PROFILE
        </h1>
      </div>

      {/* Profile Avatar */}
      <div className="flex justify-center mt-4">
        <Avatar className="h-24 w-24 border-2 border-white">
          {user.profilePicture ? (
            <AvatarImage src={user.profilePicture} alt={user.username} />
          ) : (
            <AvatarFallback className="text-xl bg-white text-[#0073AA]">
              {getNameInitials()}
            </AvatarFallback>
          )}
        </Avatar>
      </div>

      {/* Profile Form */}
      <Card className="mx-4 mt-8 rounded-none shadow-lg">
        <CardContent className="p-0">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-0">
              {/* Full Name */}
              <ProfileField
                label="NAME"
                value={user.fullName || user.username}
                isEditing={editingField === 'displayName'}
                onEdit={() => startEditing('displayName')}
                onCancel={cancelEditing}
              >
                <FormField
                  control={form.control}
                  name="displayName"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </ProfileField>

              {/* Birthdate */}
              <ProfileField
                label="BIRTHDATE"
                value={user.birthdate || 'Not set'}
                isEditing={editingField === 'birthdate'}
                onEdit={() => startEditing('birthdate')}
                onCancel={cancelEditing}
              >
                <FormField
                  control={form.control}
                  name="birthdate"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Input {...field} placeholder="DD MMMM YYYY" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </ProfileField>

              {/* Gender */}
              <ProfileField
                label="GENDER"
                value={user.gender || 'Not set'}
                isEditing={editingField === 'gender'}
                onEdit={() => startEditing('gender')}
                onCancel={cancelEditing}
              >
                <FormField
                  control={form.control}
                  name="gender"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </ProfileField>

              {/* Email */}
              <ProfileField
                label="EMAIL"
                value={user.email || 'Not set'}
                isEditing={editingField === 'email'}
                onEdit={() => startEditing('email')}
                onCancel={cancelEditing}
              >
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Input {...field} type="email" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </ProfileField>

              {/* Phone Number */}
              <ProfileField
                label="PHONE NUMBER"
                value={user.phoneNumber || 'Not set'}
                isEditing={editingField === 'phoneNumber'}
                onEdit={() => startEditing('phoneNumber')}
                onCancel={cancelEditing}
              >
                <FormField
                  control={form.control}
                  name="phoneNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Input {...field} type="tel" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </ProfileField>

              {/* Address */}
              <ProfileField
                label="ADDRESS"
                value={user.address || 'Not set'}
                isEditing={editingField === 'address'}
                onEdit={() => startEditing('address')}
                onCancel={cancelEditing}
              >
                <FormField
                  control={form.control}
                  name="address"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </ProfileField>

              {/* Submit Button - only show when editing */}
              {editingField && (
                <div className="p-4">
                  <Button 
                    type="submit" 
                    className="w-full bg-[#0073AA] hover:bg-[#005d87] rounded-none py-6"
                    disabled={updateProfileMutation.isPending}
                  >
                    SAVE & CONTINUE
                  </Button>
                </div>
              )}
            </form>
          </Form>
        </CardContent>
      </Card>
      
      {/* Security Section */}
      <Card className="mx-4 mt-4 rounded-none shadow-lg mb-20">
        <CardContent className="p-4">
          <h3 className="text-lg font-semibold mb-4">Security Options</h3>
          
          <div className="space-y-6">
            {/* Current Session Information */}
            <div>
              <h4 className="text-sm font-medium text-gray-700">Current Session</h4>
              <p className="text-xs text-gray-500 mb-2">
                You are currently logged in from this device.
              </p>
              <div className="bg-gray-50 p-3 rounded-none border border-gray-100 text-xs">
                <div className="flex justify-between mb-1">
                  <span className="text-gray-500">Device:</span>
                  <span className="font-medium">{navigator.userAgent.includes('Mobile') ? 'Mobile' : 'Desktop'}</span>
                </div>
                <div className="flex justify-between mb-1">
                  <span className="text-gray-500">Login time:</span>
                  <span className="font-medium">{new Date().toLocaleDateString()} {new Date().toLocaleTimeString()}</span>
                </div>
              </div>
            </div>

            {/* Session Management */}
            <div>
              <h4 className="text-sm font-medium text-gray-700">Account Security</h4>
              <p className="text-xs text-gray-500 mb-2">
                Having trouble with your account sessions? You can invalidate all active sessions and tokens.
                This will sign you out from all devices except this one.
              </p>
              <Button 
                variant="destructive" 
                className="w-full rounded-none"
                disabled={invalidateTokensMutation.isPending}
                onClick={() => invalidateTokensMutation.mutate()}
              >
                {invalidateTokensMutation.isPending ? "Processing..." : "Invalidate All Sessions"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Add mobile bottom navigation */}
      {isMobile && <MobileBottomNav />}
    </div>
  );
}

interface ProfileFieldProps {
  label: string;
  value: string;
  isEditing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  children: React.ReactNode;
}

function ProfileField({ 
  label, 
  value, 
  isEditing, 
  onEdit, 
  onCancel, 
  children 
}: ProfileFieldProps) {
  return (
    <div className="p-4 border-b border-gray-100">
      <div className="flex justify-between items-center">
        <FormLabel className="text-xs text-gray-500">{label}</FormLabel>
        {!isEditing && (
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={onEdit}
            className="text-[#0073AA] h-6 px-2"
          >
            CHANGE
          </Button>
        )}
        {isEditing && (
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={onCancel}
            className="text-red-500 h-6 px-2"
          >
            CANCEL
          </Button>
        )}
      </div>
      
      {isEditing ? (
        <div className="mt-1">
          {children}
        </div>
      ) : (
        <div className="mt-1 text-gray-900">{value}</div>
      )}
    </div>
  );
}
