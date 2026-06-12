import { useEffect } from "react";
import { useLocation } from "wouter";
import { useGetAuthStatus, useSendCode, useVerifyCode, useVerify2fa, getGetAuthStatusQueryKey } from "@workspace/api-client-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, HardDrive } from "lucide-react";

const phoneSchema = z.object({
  phone: z.string().min(5, "Enter a valid phone number including country code"),
});

const codeSchema = z.object({
  code: z.string().min(5, "Enter the code sent to your Telegram app"),
});

const passwordSchema = z.object({
  password: z.string().min(1, "Password is required"),
});

export default function AuthPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: authStatus, isLoading } = useGetAuthStatus();

  const sendCode = useSendCode();
  const verifyCode = useVerifyCode();
  const verify2fa = useVerify2fa();

  useEffect(() => {
    if (authStatus?.authenticated) {
      setLocation("/channels");
    }
  }, [authStatus, setLocation]);

  const phoneForm = useForm<z.infer<typeof phoneSchema>>({
    resolver: zodResolver(phoneSchema),
    defaultValues: { phone: "" },
  });

  const codeForm = useForm<z.infer<typeof codeSchema>>({
    resolver: zodResolver(codeSchema),
    defaultValues: { code: "" },
  });

  const passwordForm = useForm<z.infer<typeof passwordSchema>>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { password: "" },
  });

  const onPhoneSubmit = (values: z.infer<typeof phoneSchema>) => {
    sendCode.mutate({ data: values }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetAuthStatusQueryKey() });
      },
      onError: (error: any) => {
        toast({
          title: "Error sending code",
          description: error?.message || "Failed to send code. Check number format.",
          variant: "destructive"
        });
      }
    });
  };

  const onCodeSubmit = (values: z.infer<typeof codeSchema>) => {
    verifyCode.mutate({ data: { phone: authStatus?.phone || "", code: values.code } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetAuthStatusQueryKey() });
      },
      onError: (error: any) => {
        toast({
          title: "Invalid code",
          description: error?.message || "The code you entered is incorrect.",
          variant: "destructive"
        });
      }
    });
  };

  const onPasswordSubmit = (values: z.infer<typeof passwordSchema>) => {
    verify2fa.mutate({ data: values }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetAuthStatusQueryKey() });
      },
      onError: (error: any) => {
        toast({
          title: "Invalid password",
          description: error?.message || "The 2FA password you entered is incorrect.",
          variant: "destructive"
        });
      }
    });
  };

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-background"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  const step = authStatus?.step || "unauthenticated";

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-muted/30 p-4">
      <div className="mb-8 flex flex-col items-center">
        <div className="h-16 w-16 bg-primary rounded-2xl flex items-center justify-center mb-6 shadow-lg">
          <HardDrive className="h-8 w-8 text-primary-foreground" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Telegram Explorer</h1>
        <p className="text-muted-foreground mt-2">Professional file management for Telegram channels</p>
      </div>

      <Card className="w-full max-w-md shadow-xl border-border">
        <CardHeader>
          <CardTitle>
            {step === "unauthenticated" && "Sign In"}
            {step === "code_sent" && "Enter Code"}
            {step === "two_fa_required" && "Two-Step Verification"}
          </CardTitle>
          <CardDescription>
            {step === "unauthenticated" && "Enter your phone number to sign in to Telegram"}
            {step === "code_sent" && `We sent a code to the Telegram app on your phone`}
            {step === "two_fa_required" && "Your account is protected by an additional password"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {step === "unauthenticated" && (
            <Form {...phoneForm}>
              <form onSubmit={phoneForm.handleSubmit(onPhoneSubmit)} className="space-y-4">
                <FormField
                  control={phoneForm.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone Number</FormLabel>
                      <FormControl>
                        <Input placeholder="+1234567890" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full" disabled={sendCode.isPending}>
                  {sendCode.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Send Code
                </Button>
              </form>
            </Form>
          )}

          {step === "code_sent" && (
            <Form {...codeForm}>
              <form onSubmit={codeForm.handleSubmit(onCodeSubmit)} className="space-y-4">
                <FormField
                  control={codeForm.control}
                  name="code"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Login Code</FormLabel>
                      <FormControl>
                        <Input placeholder="12345" {...field} autoFocus />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full" disabled={verifyCode.isPending}>
                  {verifyCode.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Verify Code
                </Button>
                <div className="text-center mt-4">
                  <Button variant="link" size="sm" type="button" onClick={() => {
                    queryClient.setQueryData(getGetAuthStatusQueryKey(), (old: any) => ({...old, step: "unauthenticated"}));
                  }}>
                    Use a different number
                  </Button>
                </div>
              </form>
            </Form>
          )}

          {step === "two_fa_required" && (
            <Form {...passwordForm}>
              <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)} className="space-y-4">
                <FormField
                  control={passwordForm.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="••••••••" {...field} autoFocus />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full" disabled={verify2fa.isPending}>
                  {verify2fa.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Sign In
                </Button>
              </form>
            </Form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
