import { useState, useEffect, useCallback } from 'react';

export interface NotificationOptions {
    title: string;
    body: string;
    icon?: string;
    badge?: string;
    tag?: string;
    requireInteraction?: boolean;
    data?: any;
    onClick?: () => void;
}

export function useBrowserNotifications() {
    const [permission, setPermission] = useState<NotificationPermission>('default');
    const [isSupported, setIsSupported] = useState(false);

    useEffect(() => {
        // Check if browser supports notifications
        if ('Notification' in window) {
            setIsSupported(true);
            setPermission(Notification.permission);
        }
    }, []);

    const requestPermission = useCallback(async (): Promise<boolean> => {
        if (!isSupported) {
            console.warn('Browser does not support notifications');
            return false;
        }

        if (permission === 'granted') {
            return true;
        }

        if (permission === 'denied') {
            console.warn('Notification permission denied');
            return false;
        }

        try {
            const result = await Notification.requestPermission();
            setPermission(result);
            return result === 'granted';
        } catch (error) {
            console.error('Error requesting notification permission:', error);
            return false;
        }
    }, [isSupported, permission]);

    const showNotification = useCallback(
        async (options: NotificationOptions): Promise<Notification | null> => {
            if (!isSupported) {
                console.warn('Browser does not support notifications');
                return null;
            }

            // Request permission if not already granted
            const hasPermission = await requestPermission();
            if (!hasPermission) {
                console.warn('Notification permission not granted');
                return null;
            }

            try {
                const notificationOptions: NotificationOptions = {
                    icon: '/icon.png',
                    badge: '/icon.png',
                    requireInteraction: false,
                    ...options,
                };

                const notification = new Notification(options.title, {
                    body: options.body,
                    icon: notificationOptions.icon,
                    badge: notificationOptions.badge,
                    tag: notificationOptions.tag,
                    requireInteraction: notificationOptions.requireInteraction,
                    data: notificationOptions.data,
                });

                // Handle notification click
                if (options.onClick) {
                    notification.onclick = () => {
                        window.focus();
                        if (options.onClick) {
                            options.onClick();
                        }
                        notification.close();
                    };
                } else {
                    // Default click behavior: focus the window
                    notification.onclick = () => {
                        window.focus();
                        notification.close();
                    };
                }

                // Auto-close after 5 seconds if not interacted with
                setTimeout(() => {
                    notification.close();
                }, 5000);

                return notification;
            } catch (error) {
                console.error('Error showing notification:', error);
                return null;
            }
        },
        [isSupported, requestPermission]
    );

    return {
        isSupported,
        permission,
        requestPermission,
        showNotification,
    };
}

